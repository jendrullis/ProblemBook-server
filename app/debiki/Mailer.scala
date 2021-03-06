/**
 * Copyright (C) 2012 Kaj Magnus Lindberg (born 1979)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

package debiki

import akka.actor._
import akka.actor.Actor._
import scala.concurrent.duration._
import com.amazonaws.AmazonClientException
import com.amazonaws.auth.BasicAWSCredentials
import com.amazonaws.services.simpleemail._
import com.amazonaws.services.simpleemail.model._
import com.debiki.v0._
import java.{util => ju}
import play.api._
import play.api.libs.iteratee._
import play.api.libs.concurrent._
import play.api.Play.current
import Prelude._



object Mailer {

  /**
   * Starts a single email sending actor.
   *
   * BUG: SHOULD terminate it before shutdown, in a manner that
   * doesn't accidentally forget forever to send some emails.
   * (Also se Notifier.scala)
   */
  def startNewActor(daoFactory: TenantDaoFactory): ActorRef = {
    val actorRef = Akka.system.actorOf(
      Props(new Mailer(daoFactory)), name = s"MailerActor-$testInstanceCounter")
    testInstanceCounter += 1
    actorRef
  }

  // Not thread safe; only needed in integration tests.
  private var testInstanceCounter = 1

}



/**
 * Sends emails, via Amazon Web Services (AWS) Simple Email Service (SES).
 * For each email, saves its AWS SES message id to the database.
 * (The message id identifies the email in bounce/rejection/complaint emails
 * from e.g. the recipient's email system.)
 *
 * As of right now, only sends emails. Does not handle incoming mail (there is
 * no incoming mail, instead such mail ends up in a certain Google Domains
 * account instead, namely support at debiki dot se (as of today 2012-03-30).
 *
 * COULD rewrite to use Apache Common's email module instead, and not
 * depend on AWS classes and to not need the AWS access key. But it's not
 * possible to get back AWS' email guid from Apache Common email lib, or is it?
 * (That guid can be used to track bounces etcetera I think.)
 */
class Mailer(val daoFactory: TenantDaoFactory) extends Actor {


  val logger = play.api.Logger("app.mailer")


  private val _awsClient = {
    val accessKeyId = Utils.getConfigStringOrDie("aws.accessKeyId")
    val secretKey = Utils.getConfigStringOrDie("aws.secretKey")
    new AmazonSimpleEmailServiceClient(
       new BasicAWSCredentials(accessKeyId, secretKey))
  }


  /**
   * Accepts an (Email, tenant-id), and then sends that email on behalf of
   * the tenant. The caller should already have saved the email to the
   * database (because Mailer doesn't know exactly how to save it, e.g.
   * if any other tables should also be updated).
   */
  def receive = {
    case (email: Email, tenantId: String) =>
      _sendEmail(email, tenantId)

    /*
    case Bounce/Rejection/Complaint/Other =>
     */
  }


  private def _sendEmail(emailToSend: Email, tenantId: String) {

    // I often use @example.com, or simply @ex.com, when posting test comments
    // — don't send those emails, to keep down the bounce rate.
    if (emailToSend.sentTo.endsWith("example.com") ||
        emailToSend.sentTo.endsWith("ex.com"))
      return

    val awsSendReq = _makeAwsSendReq(emailToSend)
    val now = Some(new ju.Date)
    val emailSentOrFailed = _tellAwsToSendEmail(awsSendReq) match {
      case Right(awsEmailId) =>
        val email = emailToSend.copy(sentOn = now,
          providerEmailId = Some(awsEmailId))
        logger.trace("Email sent: "+ email)
        email
      case Left(error) =>
        // Could shorten the subject and body, the exact text doesn't
        // matter?? only the text length could possibly be related
        // to the failure?? (Well unless AWS censors "ugly" or spam
        // like words?)
        //subject = "("+ subjContent.getData.length +" chars)",
        //bodyHtmlText = "("+ htmlContent.getData.length +" chars)",
        val email = emailToSend.copy(sentOn = now, failureText = Some(error))
        logger.warn("Error sending email: "+ email)
        email
    }

    val tenantDao = daoFactory.newTenantDao(
      QuotaConsumers(tenantId = tenantId))

    tenantDao.updateSentEmail(emailSentOrFailed)
  }


  private def _makeAwsSendReq(email: Email): SendEmailRequest = {

    val toAddresses = new ju.ArrayList[String]
    toAddresses.add(email.sentTo)
    val dest = (new Destination).withToAddresses(toAddresses)

    val subjContent = (new Content).withData(email.subject)
    val htmlContent = (new Content).withData(email.bodyHtmlText)
    val body = (new Body).withHtml(htmlContent)
    val mess = (new Message).withSubject(subjContent).withBody(body)

    val awsSendReq = (new SendEmailRequest)
       .withSource("support@debiki.se")
       .withDestination(dest)
       .withMessage(mess)

    awsSendReq
  }


  /**
   * Makes a network call to Amazon SES to send the message; returns either
   * the AWS SES message id, or an error message.
   *
   * Perhaps good reading:
   * http://colinmackay.co.uk/blog/2011/11/18/handling-bounces-on-amazon-ses/
   */
  private def _tellAwsToSendEmail(awsSendReq: SendEmailRequest)
        : Either[String, String] = {

    // Amazon SES automatically intercepts all bounces and complaints,
    // and then forwards them to you.
    //   http://aws.amazon.com/ses/faqs/#38

    // When using sendEmail(), Amazon SES sends feedback to the email
    // address in the ReturnPath parameter. If not specified, then
    // feedback is sent to the email address in the Source parameter.
    //  http://aws.amazon.com/ses/faqs/#39

    try {
      // The AWS request blocks until completed.
      val result: SendEmailResult = _awsClient.sendEmail(awsSendReq)
      val messageId: String = result.getMessageId
      logger.debug("Email sent, AWS SES message id: "+ messageId)
      Right(messageId)
    }
    catch  {
      //case ex: ThrottlingException =>
      // We're sending too much email, or sending at too fast a rate.
      //case ex: MessageRejectedException
      //case ex: AmazonClientException =>
      //case ex: AmazonServiceException
      // Unexpected errors:
      case ex: Exception =>
        logger.warn("AWS SES sendEmail() failure: "+
           classNameOf(ex) +": "+ ex.toString)
        logger.trace("Uninteresting stack trace: "+ ex.printStackTrace);
        Left(ex.toString)
    }
  }

}

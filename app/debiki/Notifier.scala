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
import scala.concurrent.duration._
import scala.concurrent.ExecutionContext.Implicits.global
import Prelude._



object Notifier {

  /**
   * Starts a single notifier actor.
   *
   * BUG: SHOULD terminate it before shutdown, in a manner that
   * doesn't accidentally forget forever to send some notifications.
   * (Also se object Mailer.)
   */
  def startNewActor(systemDao: SystemDao, tenantDaoFactory: TenantDaoFactory)
        : ActorRef = {
    val actorRef = Akka.system.actorOf(Props(
      new Notifier(systemDao, tenantDaoFactory)),
      name = s"NotifierActor-$testInstanceCounter")
    Akka.system.scheduler.schedule(0 seconds, 20 seconds, actorRef, "SendNotfs")
    testInstanceCounter += 1
    actorRef
  }

  // Not thread safe; only needed in integration tests.
  var testInstanceCounter = 1

}



/**
 * Loads pending notifications from the database, and asks
 * Mailer to send those notifications. (For example, asks Mailer to notify
 * someone of a reply to his/her comment.)
 *
 * Updates the notfs so no one else also attempts to construct and send
 * the same emails.
 *
 * Thread safe.
 */
class Notifier(val systemDao: SystemDao, val tenantDaoFactory: TenantDaoFactory)
  extends Actor {


  val logger = play.api.Logger("app.notifier")


  def receive = {
    case "SendNotfs" =>
      val notfsToMail =
        systemDao.loadNotfsToMailOut(
           delayInMinutes = 0, numToLoad = 11)
      logger.trace("Loaded "+ notfsToMail.notfsByTenant.size +
         " notfs, to "+ notfsToMail.usersByTenantAndId.size +" users.")
      _trySendEmailNotfs(notfsToMail)
  }


  /**
   * Sends notifications, for all tenants and notifications specified.
   */
  def _trySendEmailNotfs(notfsToMail: NotfsToMail) {

    for {
      (tenantId, tenantNotfs) <- notfsToMail.notfsByTenant
      notfsByUserId: Map[String, Seq[NotfOfPageAction]] =
         tenantNotfs.groupBy(_.recipientUserId)
      (userId, userNotfs) <- notfsByUserId
    }{
      logger.debug("Considering "+ userNotfs.size +" notfs to user "+ userId)

      val tenantDao = tenantDaoFactory.newTenantDao(
         QuotaConsumers(tenantId = tenantId))
      val tenant = tenantDao.loadTenant()
      val userOpt = notfsToMail.usersByTenantAndId.get(tenantId -> userId)

      // Send email, or remember why we didn't.
      val problemOpt = (tenant.chost, userOpt.map(_.emailNotfPrefs)) match {
        case (Some(chost), Some(EmailNotfPrefs.Receive)) =>
          _constructAndSendEmail(tenantDao, chost, userOpt.get, userNotfs)
          None
        case (None, _) =>
          val problem = "No chost for tenant id: "+ tenantId
          logger.warn("Skipping email to user id "+ userId +": "+ problem)
          Some(problem)
        case (_, None) =>
          val problem = "User not found"
          logger.warn("Skipping email to user id "+ userId +": "+ problem)
          Some(problem)
        case (_, Some(_)) =>
          Some("User declines emails")
      }

      // If we decided not to send the email, remember not to try again.
      problemOpt foreach { problem =>
        tenantDao.skipEmailForNotfs(userNotfs,
           debug = "Email skipped: "+ problem)
      }
    }
  }


  def _constructAndSendEmail(tenantDao: TenantDao, chost: TenantHost,
        user: User, userNotfs: Seq[NotfOfPageAction]) {
    // Save the email in the db, before sending it, so even if the server
    // crashes it'll always be found, should the receiver attempt to
    // unsubscribe. (But if you first send it, then save it, the server
    // might crash inbetween and it wouldn't be possible to unsubscribe.)
    val origin =
      (chost.https.required ? "https://" | "http://") + chost.address
    val email = _constructEmail(origin, user, userNotfs)
    tenantDao.saveUnsentEmailConnectToNotfs(email, userNotfs)

    logger.debug("About to send email to "+ email.sentTo)
    Debiki.sendEmail(email, tenantDao.tenantId)
  }


  def _constructEmail(origin: String, user: User,
        notfs: Seq[NotfOfPageAction]): Email = {

    val subject: String =
      if (notfs.size == 1) "You have a reply, to one of your comments"
      else "You have replies, to comments of yours"

    val email = Email(sendTo = user.email, subject = subject,
      bodyHtmlText = "?")

    val htmlContent =
      <div>
        <p>Dear {user.displayName},</p>
        { views.NotfHtmlRenderer(origin).render(notfs) }
        <p>
          Kind regards,<br/>
          <a href="http://www.debiki.com">Debiki</a>
        </p>
        <p style='font-size: 80%; opacity: 0.65; margin-top: 2em;'>
          <a href={origin +"/?unsubscribe&email-id="+ email.id}>Unsubscribe</a>
        </p>
      </div>.toString

    email.copy(bodyHtmlText = htmlContent)
  }

}


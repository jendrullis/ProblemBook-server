/**
 * Copyright (c) 2012 Kaj Magnus Lindberg (born 1979)
 */

package controllers

import org.specs2.mutable._
import com.debiki.v0._
import com.debiki.v0


class UtilsSpec extends Specification {


  "Utils.parsePathRanges" can {

    import Utils.parsePathRanges

    val pagePath = PagePath("tenantId", "/folder/", pageId = None,
      showId = false, pageSlug = "")

    "fallback to defaults" >> {
      val ranges = parsePathRanges(pagePath, Map.empty)
      ranges must be_==(PathRanges(folders = Seq("/folder/"), trees = Nil))
    }

    "understand &in-folder and &for-folder" >> {
      val rangesIn = parsePathRanges(pagePath, Map("in-folder" -> Seq("")))
      val rangesFor = parsePathRanges(pagePath, Map("for-folder" -> Seq("")),
         "for")
      val key = PathRanges(folders = Seq("/folder/"), trees = Nil)
      rangesIn must be_==(key)
      rangesFor must be_==(key)
    }

    "understand &in-tree and &for-tree" >> {
      val rangesIn = parsePathRanges(pagePath, Map("in-tree" -> Seq("")))
      val rangesFor = parsePathRanges(pagePath, Map("for-tree" -> Seq("")),
         "for")
      val key = PathRanges(folders = Nil, trees = Seq("/folder/"))
      rangesIn must be_==(key)
      rangesFor must be_==(key)
    }

    "understand &in-folders=f/" >> {
      val ranges = parsePathRanges(pagePath, Map("in-folders" -> Seq("f/")))
      ranges must be_==(PathRanges(folders = Seq("/folder/f/"), trees = Nil))
    }

    "understand &in-folders=f/,f2/&in-trees=t/,t2/" >> {
      val ranges = parsePathRanges(pagePath, Map(
        "in-folders" -> Seq("f/,f2/"), "in-trees" -> Seq("t/,t2/")))
      ranges must be_==(PathRanges(folders = Seq("/folder/f/", "/folder/f2/"),
        trees = Seq("/folder/t/", "/folder/t2/")))
    }

    "understand absolute paths: /f/ and /t/" >> {
      val ranges = parsePathRanges(pagePath, Map(
        "in-folders" -> Seq("/f/"), "in-trees" -> Seq("/t/")))
      ranges must be_==(PathRanges(folders = Seq("/f/"), trees = Seq("/t/")))
    }
  }

}

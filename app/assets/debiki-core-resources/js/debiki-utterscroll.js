/*
 * Debiki Utterscroll — dragscroll everywhere
 *
 * Utterscroll enables dragscroll everywhere, on the whole page.
 * Then you can press-and-dragscroll anywhere, instead of
 * using the scrollbars (or scroll wheel — but you usually cannot
 * scroll horizontally with the scroll wheel?).
 * You won't scroll when you click buttons, inputs and links
 * etcetera. And not when you select text.
 *
 *
 * Copyright (c) 2012 Kaj Magnus Lindberg
 *
 * From 2013-06-01 and onwards, licensed under the GNU Lesser General Public
 * License version 3 or any later version:
 *   http://www.gnu.org/licenses/lgpl.txt
 *
 *
 * Use like so: (for example)
 *
 *    <script type='text/javascript' src='debiki-utterscroll.js'></script>
 *
 *    if (!Modernizr.touch)  // if not a smartphone
 *      Debiki.v0.utterscroll({
 *          scrollstoppers: '.CodeMirror, .ui-resizable-handle' });
 *
 *
 * Utterscroll scrolls the closest scrollable element, or the window.
 * However, scrolling anything but the window, depends on a jQuery selector,
 * ':scrollable', being available. (Otherwise, the window is always scrolled.)
 * There should be a file jquery.scrollable.js included in this
 * distribution (which defines the ':scrollable' selector).
 * That file is actually an excerpt from:
 *   https://github.com/litera/jquery-scrollintoview/blob/master/
 *      jquery.scrollintoview.js
 *
 *
 * As of today (2012-02-29), tested with jQuery 1.6.4 and recent versions
 * of Google Chrome, Firefox and Opera, and IE 6, 7, 8 and 9.
 * (Scrolling the window has been tested; scrolling other elems has not
 * been thoroughly tested.)
 *
 * Known issues:
 * - If you start selecting text at the very the end of an element,
 *   then Utterscroll thinks you intend to scroll. So you'll scroll,
 *   rather than selecting text. For more details, search for
 *   "Fixable BUG" in this document.
 *
 *
 * Find in the rest of this file:
 * - jQuery extensions: jQuery.dwEnableSelection and dwDisableSelection
 * - Debiki Utterscroll
 *
 */



// dwEnableSelection and jQuery.dwDisableSelection
// =======================================
// Create a jQuery extension that Enable/Disable text selection.
// — There's a function jQuery.disableSelection, but it won't cancel
// a selection that has already started.
// — There's a jQuery plugin, jquery.disable.text.select.js,
// with creates a function $.fn.disableTextSelect,
// but it's not able to cancel a selection that has already
// started (it doesn't specify -webkit-user-select).
// — Regrettably, in Opera, dwDisableSelection won't cancel any
// current selection.
//----------------------------------------
  (function($) {
//----------------------------------------

$.fn.dwEnableSelection = function() {
  return this.each(function() {  // ?? is `this.each' really needed
    $(this)
        .attr('unselectable', 'off')
        .css({
          'user-select': '',
          '-ms-user-select': '',
          '-moz-user-select': '',
          '-webkit-user-select': '',
          '-o-user-select': '',
          '-khtml-user-select': ''
        })
        .each(function() {  // for IE
          this.onselectstart = function() { return true; };
        });
  });
};

$.fn.dwDisableSelection = function() {
  // This function is based on answers to this question:
  //  <http://stackoverflow.com/questions/2700000/
  //      how-to-disable-text-selection-using-jquery>
  //  namely this answer: <http://stackoverflow.com/a/2700029/694469>
  //  and this: <http://stackoverflow.com/a/7254601/694469>.

  return this.each(function() {  // ?? is `this.each' really needed
    $(this)
        .attr('unselectable', 'on')
        .css({
          'user-select': 'none',
          '-ms-user-select': 'none',
          '-moz-user-select': 'none',
          '-webkit-user-select': 'none',
          '-o-user-select': 'none',
          '-khtml-user-select': 'none'
        })
        .each(function() {  // for IE
          this.onselectstart = function() { return false; };
        });
  });
};

//----------------------------------------
  })(jQuery);
//----------------------------------------



// Debiki-Utterscroll
// =======================================
//----------------------------------------
  (function($){
//----------------------------------------

// (v0 is a namespace version number.)
if (!window.Debiki)
  window.Debiki = { v0: {} };

// Options:
//  scrollstoppers:
//    jQuery selectors, e.g. '.CodeMirror, div.your-class'.
//    Dragging the mouse inside a scrollstopper never results in scrolling.
Debiki.v0.utterscroll = function(options) {

  var defaults = {
    defaultScrollstoppers: 'a, area, button, command, input, keygen, label,'+
        ' option, select, textarea, video',  // ?? canvas, embed, object
    scrollstoppers: '',
    mousedownOnWinVtclScrollbar: function() {},
    mousedownOnWinHztlScrollbar: function() {}
  };

  var settings = $.extend({}, defaults, options);
  var allScrollstoppers = settings.defaultScrollstoppers;
  if (settings.scrollstoppers.length > 0)
    allScrollstoppers += ', '+ options.scrollstoppers;

  var $elemToScroll;
  var startPos;
  var lastPos;
  var tryLaterHandle;

  // Helps detect usage of the browser window scrollbars.
  var $viewportGhost =
      $('<div style="width: 100%; height: 100%;' +
        ' position: fixed; top: 0; left: 0; z-index: -999"></div>')
      .appendTo(document.body);

  $(document).mousedown(startScrollPerhaps);
  $(document).mouseup(clearTryLaterCallback)

  function clearTryLaterCallback() {
    if (!tryLaterHandle) return;
    clearTimeout(tryLaterHandle);
    tryLaterHandle = undefined;
  }

  function startScrollPerhaps(event) {
    // Only left button drag-scrolls.
    if (event.which !== 1 )
      return;

    // Never scroll, when mouse down on certain elems.
    var $target = $(event.target);
    var $noScrollElem = $target.closest(allScrollstoppers);
    if ($noScrollElem.length > 0)
      return;

    // Fire event and cancel, on browser window scrollbar click.
    // - In Chrome, IE and FF, but not in Opera, when you mousedown on
    // a scrollbar, a mousedown event happens.
    // - The subsequent fix (for scrollbars in general) cannot handle the
    // *window* scrollbar case, because the <html> elem can be smaller
    // than the viewport, so checking that the mousedown
    // didn't happen inside the <html> elem won't work. We need
    // $viewportGhost, which always covers the whole viewport.
    if (event.pageX > $viewportGhost.offset().left + $viewportGhost.width()) {
      // Vertical scrollbar mousedown:ed.
      settings.mousedownOnWinVtclScrollbar();
      return;
    }
    if (event.pageY > $viewportGhost.offset().top + $viewportGhost.height()) {
      // Horizontal scrollbar mousedown:ed.
      settings.mousedownOnWinHztlScrollbar();
      return;
    }

    // Cancel if scrollbar clicked (other than the browser window scrollbars).
    // - Related: In Chrome, "Scrollbar triggers onmousedown, but fails to
    // trigger onmouseup". (Also mousemove won't happen!)
    // See http://code.google.com/p/chromium/issues/detail?id=14204.
    // - The workaround: Place a wigth & height 100% elem, $ghost,
    // inside $target, and if the mousedown position is not iside $ghost,
    // then the scrollbars were clicked.
    // (What about overflow === 'inherit'? Would anyone ever use that?)
    if ($target.css('overflow') === 'auto' ||
        $target.css('overflow') === 'scroll') {
      // Okay, scrollbars might have been clicked, in Chrome.
      var $ghost = $('<div style="width: 100%; height: 100%; ' +
          'position: absolute; top: 0; left: 0;"></div>');
      $target.prepend($ghost)
      // Now $ghost fills up $target, up to the scrollbars.
      // Check if the click happened outside $ghost.
      var isScrollbar = false;
      if (event.pageX > $ghost.offset().left + $ghost.width())
        isScrollbar = true; // vertical scrollbar clicked, don't dragscroll
      if (event.pageY > $ghost.offset().top + $ghost.height())
        isScrollbar = true; // horizontal scrollbar clicked
      $ghost.remove();
      if (isScrollbar)
        return;
    }

    // Find the closest elem with scrollbars.
    // If the ':scrollable' selector isn't available, scroll the window.
    // Also don't scroll `html' and `body' — scroll `window' instead, that
    // works better across all browsers.
    $elemToScroll = $.expr[':'].scrollable ?
        $target.closest(':scrollable:not(html, body)').add($(window)).first() :
        $(window);


    // Scroll, unless the mouse down is a text selection attempt:
    // -----

    // If there's no text in the event.target, then start scrolling.
    // Disregard whitespace "text" though.
    var textElems = $target.contents().filter(function(ix, elem, ar) {
      if (elem.nodeType !== 3)  // is it a text node?
        return false;
      if (elem.data.match(/^[ \t\r\n]*$/))  // is it whitespace?
        return false;
      return true;  // it is real text
    });
    if (textElems.length === 0) {
      startScroll(event);
      /*
      console.log('$target.contents(): ---------------');
      console.log($target.contents());
      console.log('-------------------------------------------');
      */
      return false;
    }

    // After a moment, the browser (Chrome and FF and IE 9) has created
    // a selection object that we can examine to find out if the
    // mousesdown happened where there is no text. If so, we'll scroll.
    setTimeout(function() {
      startScrollUnlessMightSelectText(event);
    }, 0);

    // If the user selects no text, but just holds down the mouse
    // button, then start scrolling. — This enable scrolldrag
    // also on pages almost covered with text.
    tryLaterHandle = setTimeout(function() {
      startScrollUnlessHasSelectedText(event);
    }, 300);

    // Don't event.preventDefault(). — The user should be able
    // to e.g. click buttons and select text.
  }

  // Starts scrolling unless the mousedown happened on text — then let
  // the user select text instead.
  function startScrollUnlessMightSelectText(event) {
    // A moment after mousedown, the browser seems to always return
    // a selection if the cursor is on text — well, at least Chrome and
    // FF and IE 9 they create a selection object for the empty string.

    // Opera however does not, so skip Opera here (result: Opera will
    // select text, instead of scrolldragging, sometimes when you click
    // close to text).
    if ($.browser.opera)
      return;

    // IE 7 and 8.
    // It seems  document.selection.createRange().text  is always an
    // empty string here — don't know if the user mousedown:ed on text.
    // So don't scroll (result: IE 7 and 8 will sometimes select text,
    // instead of scrolling).
    if (!window.getSelection)
      return;

    // This happens a tiny while after the mousedown event, and now
    // the browser knows if any text is selected/mouse-down:ed.
    var sel = window.getSelection();

    // If there is no text after [the mousedown position in the anchor
    // node], the mousedown didn't happen on the text, but somewhere
    // where text has already ended. Then scroll.
    // {{{ If statement explanation: Consider this text:
    // "Abcd!" — if you mousedown just before the '!',
    // `substr().length' will be 1, because the '!' is to the right
    // of the mousedown. If however you mousedown to the right of the '!'
    // then anchorOffset is set to the position after the '!' and
    // substr(...).length is 0.  }}}
    // {{{ Fixable BUG: Cannot mousedown on and select the very last character
    // in an elem (e.g. <p> or <h2>), because when you mousedown on the
    // right part of that char, anchorOffset will be *after* it,
    // and there's no difference from this anchorOffset and the anchorOffset
    // when you click a bit outside of the last character (on whitespace).
    // Perhaps an insane workaround: Add a &nbsp after the mousedown:ed
    // elem — then the &nbsp will be the very last char. But this might
    // cause a line wrap?? — Use a narrow non-breaking space instead,
    // &#x202F; ? I tested to append one to a <h2>, worked fine :-)
    // Here are lots of invisible spaces:
    //  http://www.cs.tut.fi/~jkorpela/chars/spaces.html
    // Or?? Create a selection for all text in the mousedown:ed elem,
    // and perhaps then I can check dist from [all 4 corners of the selection]
    // to [the mousedown position], if small, don't scrolldrag.
    // Best approach? Append an empty <span> to the end of the mousedown:ed
    // elem, and measure the dist from that <span> to the mousedown pos.
    // If close, don't scrolldrag. Then remove the span.
    // People who do this:
    //  <http://stackoverflow.com/questions/1589721/
    //      how-can-i-position-an-element-next-to-user-text-selection>
    //  <http://stackoverflow.com/questions/2031518/
    //      javascript-selection-range-coordinates>
    // }}}
    if (!sel.anchorNode || !sel.anchorNode.data ||
        sel.anchorNode.data.substr(sel.anchorOffset, 1).length === 0) {
      // No text under mouse cursor. The user probably doesn't try to
      // select text, and no other elem has captured the event.
      startScroll(event);
      clearTimeout(tryLaterHandle);
    } else {
      // The user might be selecting text to copy to the clipboard.
      return;  // breakpoint here
    }
  }

  // Starts scrolling, unless already scrolling, and unless the user
  // has selected text.
  function startScrollUnlessHasSelectedText(event) {
    if (startPos) return; // already scrolling
    var selectedText;

    if (window.getSelection) {
      selectedText = window.getSelection().toString();
    } else if (document.selection) {  // IE 7 and 8
      selectedText = document.selection.createRange().text;
    } else {
      // Don't scroll.
      selectedText = '';
    }

    if (selectedText.length === 0)
      startScroll(event);
  }

  function startScroll(event) {
    $(document).mousemove(doScroll);
    $(document).mouseup(stopScroll);
    $(document.body).css('cursor', 'move');

    // Y is the distance to the top.
    startPos = { x: event.clientX, y: event.clientY };
    lastPos = { x: event.clientX, y: event.clientY }; 

    // Don't select text whilst dragging.
    // It's terribly annoying if scrolling results in selecting text.
    // Emptying the selection from doScroll results in a
    // flickering fledgling selection. (The selection starts, is
    // emptied, starts again, is emptied, and so on.) So disable
    // selections completely. — But don't use jQuery's disableSelection,
    // because it won't cancel an already existing selection. (There might
    // be one, because if you keep the mouse button down for a while,
    // on text (then the browser thinks you have selected an empty string),
    // without moving the mouse, then you start scrolling.)
    $(document.body).dwDisableSelection();
    // (If doesn't work, could try:  $(document.body).focus()?
    // see: http://stackoverflow.com/questions/113750/ )
    emptyWindowSelection();
  }

  function doScroll(event) {
    // Find movement since mousedown, and since last scroll step.
    var distTotal = {
      x: Math.abs(event.clientX - startPos.x),
      y: Math.abs(event.clientY - startPos.y)
    };
    var distNow = {
      x: event.clientX - lastPos.x,
      y: event.clientY - lastPos.y
    };

    // var origDebug = ' orig: '+ distNow.x +', '+ distNow.y;

    // Scroll faster, if you've scrolled far.
    // Then you can easily move viewport
    // large distances, and still retain high precision when
    // moving small distances. (The calculations below are just
    // heuristics that works well on my computer.)
    // Don't move too fast for Opera though: it re-renders the screen
    // slowly (unbearably slowly if there're lots of SVG arrows!) and
    // the reported mouse movement distances would becom terribly huge,
    // e.g. 1000px, and then the viewport jumps randomly.
    var mul;
    if (distTotal.x > 9){
      mul = Math.log((distTotal.x - 9) / 3);
      if (mul > 1.7 && $.browser.opera) mul = 1.7;  // see comment above
      if (mul > 1) distNow.x *= mul;
    }
    if (distTotal.y > 5){
      mul = Math.log((distTotal.y - 5) / 2);
      if (mul > 1.3 && $.browser.opera) mul = 1.3;
      if (mul > 1) distNow.y *= mul;
    }

    /*
    console.log(
      ' clnt: '+ event.clientX +', '+ event.clientY +
      ' strt: '+ startPos.x +', '+ startPos.y +
      origDebug +
      ' totl: '+ distTotal.x +', '+ distTotal.y +
      ' rslt: '+ distNow.x +', '+ distNow.y);
    */

    $elemToScroll.scrollLeft($elemToScroll.scrollLeft() - distNow.x);
    $elemToScroll.scrollTop($elemToScroll.scrollTop() - distNow.y);

    lastPos = {
      x: event.clientX,
      y: event.clientY
    };

    // In Opera, dwDisableSelection doesn't clear any existing selection.
    // So clear the selection each scroll step instead. (It's very
    // annoying if you select text when you scrolldrag.)
    if ($.browser.opera)
      emptyWindowSelection();
  }

  function stopScroll(event) {
    $elemToScroll = undefined;
    startPos = undefined;
    lastPos = undefined;
    clearTryLaterCallback();
    $(document.body).dwEnableSelection();
    $(document.body).css('cursor', '');  // cancel 'move' cursor
    $.event.remove(document, 'mousemove', doScroll);
    $.event.remove(document, 'mouseup', stopScroll);

    // On mousedown, `false' was perhaps not returned, so we should probably
    // *not* return false here? Anyway, if we `return false', Opera sometimes
    // won't clear an existing selection. Result: Many disjoint sections
    // coexisting at the same time. Only Opera — an Opera bug? That
    // bug happens now too, without `return false', hmm.
    // But the bug happens infrequently, it's a fairly harmless issue I think.
  }

  function emptyWindowSelection() {
    // Based on <http://groups.google.com/group/jquery-ui-layout/
    //    browse_thread/thread/875b5f2ae68821b6>
    if (window.getSelection) {
      if (window.getSelection().empty) {
        // Chrome
        window.getSelection().empty();
      } else if (window.getSelection().removeAllRanges) {
        // Old FF versions?
        window.getSelection().removeAllRanges();
      }
    } else if (document.selection) {
      // IE
      document.selection.empty();
    }
  }

};

//----------------------------------------
  })(jQuery);
//----------------------------------------

// vim: fdm=marker et ts=2 sw=2 tw=80 fo=tcqwn list
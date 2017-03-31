(function() {
  'use strict';
  var defaults = {
      0: {
        src: 'example-thumbnail.png'
      }
    },
    extend = function() {
      var args, target, i, object, property;
      args = Array.prototype.slice.call(arguments);
      target = args.shift() || {};
      for (i in args) {
        object = args[i];
        for (property in object) {
          if (object.hasOwnProperty(property)) {
            if (typeof object[property] === 'object') {
              target[property] = extend(target[property], object[property]);
            } else {
              target[property] = object[property];
            }
          }
        }
      }
      return target;
    },
    getComputedStyle = function(el, pseudo) {
      return function(prop) {
        if (window.getComputedStyle) {
          return window.getComputedStyle(el, pseudo)[prop];
        } else {
          return el.currentStyle[prop];
        }
      };
    },
    offsetParent = function(el) {
      if (el.nodeName !== 'HTML' && getComputedStyle(el)('position') === 'static') {
        return offsetParent(el.offsetParent);
      }
      return el;
    },
    getScrollOffset = function() {
      if (window.pageXOffset) {
        return {
          x: window.pageXOffset,
          y: window.pageYOffset
        };
      }
      return {
        x: document.documentElement.scrollLeft,
        y: document.documentElement.scrollTop
      };
    },
    // unfold sprites configuration by automatically calculating correct window
    // for each sprite image
    unfoldSpritesConf = function(options) {
      var last = {};
      Object.keys(options).forEach(function(key) {
        var s;
        if (!(s = options[key].sprites))
          return;
        delete options[key].sprites;
        if (!s.position && s.interval && s.count) {
          s.position = [];
          for (var i=0; i<s.count; i++)
            s.position.push(+key+i*s.interval);
        }
        var rows = s.rows||1;
        var cols = Math.ceil(s.position.length/rows);
        s.position.forEach(function(pos, i) {
          var x = i%cols, y = Math.floor(i/cols);
          options[pos] = options[pos]||{};
          options[pos] = extend({}, last, options[pos], {
            width: s.width,
            height: s.height,
            style: {
              left: '-'+s.width*x+'px',
              top: '-'+s.height*y+'px',
              width: s.width*cols+'px',
              height: s.height*rows+'px',
            }
          });
          last = options[key];
        });
      });
      return options;
    },
    androidHack = function() {
      // Android doesn't support :active and :hover on non-anchor and non-button elements
      // so, we need to fake the :active selector for thumbnails to show up.
      if (navigator.userAgent.toLowerCase().indexOf("android") !== -1) {
        var progressControl = player.controlBar.progressControl;
        var addFakeActive = function() {
          progressControl.addClass('fake-active');
        };
        var removeFakeActive = function() {
          progressControl.removeClass('fake-active');
        };
        progressControl.on('touchstart', addFakeActive);
        progressControl.on('touchend', removeFakeActive);
        progressControl.on('touchcancel', removeFakeActive);
      }
    };

  /**
   * register the thubmnails plugin
   */
  videojs.plugin('thumbnails', function(options) {
    var player = this;
    options = options && unfoldSpritesConf(options);
    if (player._thumbs) {
      player._thumbs.settings = extend({}, defaults, options);
      return;
    }
    player._thumbs = {};
    player._thumbs.settings = extend({}, defaults, options);
    androidHack();

    // create the thumbnail
    var div = document.createElement('div');
    div.className = 'vjs-thumbnail-holder';
    var img = document.createElement('img');
    div.appendChild(img);
    img.src = player._thumbs.settings['0'].src;
    img.className = 'vjs-thumbnail';
    extend(img.style, player._thumbs.settings['0'].style);

    // center the thumbnail over the cursor if an offset wasn't provided
    if (!img.style.left && !img.style.right) {
      img.onload = function() {
        img.style.left = -(img.naturalWidth / 2) + 'px';
      };
    }

    // keep track of the duration to calculate correct thumbnail to display
    var duration = player.duration();

    // when the container is MP4
    player.on('durationchange', function(event) {
      duration = player.duration();
    });

    // when the container is HLS
    player.on('loadedmetadata', function(event) {
      duration = player.duration();
    });

    // add the thumbnail to the player
    var progressControl = player.controlBar.progressControl;
    var el = progressControl.el();
    if (el.firstChild)
      el.insertBefore(div, el.firstChild);
    else
      el.appendChild(div);

    var moveListener = function(event) {
      var pageXOffset = getScrollOffset().x;
      var clientRect = offsetParent(progressControl.el()).getBoundingClientRect();
      var right = (clientRect.width || clientRect.right) + pageXOffset;

      var pageX = event.pageX;
      if (event.changedTouches) {
        pageX = event.changedTouches[0].pageX;
      }

      // find the page offset of the mouse
      var left = pageX || (event.clientX + document.body.scrollLeft +
        document.documentElement.scrollLeft);
      // subtract the page offset of the positioned offset parent
      left -= offsetParent(progressControl.el()).getBoundingClientRect().left +
        pageXOffset;

      // apply updated styles to the thumbnail if necessary
      // mouseTime is the position of the mouse along the progress control bar
      // `left` applies to the mouse position relative to the player so we need
      // to remove the progress control's left offset to know the mouse position
      // relative to the progress control
      var mouseTime = Math.floor((left - progressControl.el().offsetLeft) /
        progressControl.width() * duration);
      var active = 0, settings = player._thumbs.settings;
      for (var time in settings) {
        if (mouseTime > time) {
          active = Math.max(active, time);
        }
      }
      var setting = settings[active];
      if (setting.src && img.src != setting.src) {
        img.src = setting.src;
      }
      var scale = player.hasClass('vjs-fullscreen') ? 1.5 : 1;
      if (setting.style) {
        img.style.left = parseFloat(setting.style.left)*scale+'px';
        img.style.top = parseFloat(setting.style.top)*scale+'px';
        img.style.width = parseFloat(setting.style.width)*scale+'px';
        img.style.height = parseFloat(setting.style.height)*scale+'px';
      } else {
        img.style.width = 100*scale+'%';
        img.style.height = 100*scale+'%';
      }

      var width = parseFloat(setting.width || settings[0].width)*scale;
      var height = parseFloat(setting.height || settings[0].height)*scale;
      var halfWidth = width / 2;

      // make sure that the thumbnail doesn't fall off the right side of the
      // left side of the player
      if ((left + halfWidth) > right) {
        left = right - width;
      } else if (left < halfWidth) {
        left = 0;
      } else {
        left -= halfWidth;
      }

      div.style.width = width + 'px';
      div.style.height = height + 'px';
      div.style.left = left + 'px';
      div.style.top = '-' + height + 'px';
      div.style.display = 'block';
    };

    // update the thumbnail while hovering
    progressControl.on('mousemove', moveListener);
    progressControl.on('touchmove', moveListener);

    var moveCancel = function(event) {
      div.style.display = 'none';
    };

    // move the placeholder out of the way when not hovering
    progressControl.on('mouseout', moveCancel);
    progressControl.on('touchcancel', moveCancel);
    progressControl.on('touchend', moveCancel);
    player.on('userinactive', moveCancel);
  });
})();

(function () {
  'use strict';

  window.Darkroom = Darkroom;

// Core object of DarkroomJS.
// Basically it's a single object, instanciable via an element
// (it could be a CSS selector or a DOM element), some custom options,
// and a list of plugin objects (or none to use default ones).
  function Darkroom(element, options, plugins) {
    return this.constructor(element, options, plugins);
  }

// Create an empty list of plugin objects, which will be filled by
// other plugin scripts. This is the default plugin list if none is
// specified in Darkroom'ss constructor.
  Darkroom.plugins = [];

  Darkroom.prototype = {
    // Reference to the main container element
    containerElement: null,

    // Reference to the Fabric canvas object
    canvas: null,

    // Reference to the Fabric image object
    image: null,

    // Reference to the Fabric source canvas object
    sourceCanvas: null,

    // Reference to the Fabric source image object
    sourceImage: null,

    // Track of the original image element
    originalImageElement: null,

    // Stack of transformations to apply to the image source
    transformations: [],

    // Default options
    defaults: {
      // Canvas properties (dimension, ratio, color)
      minWidth: null,
      minHeight: null,
      maxWidth: null,
      maxHeight: null,
      ratio: null,
      backgroundColor: '#fff',

      // Plugins options
      plugins: {},

      // Post-initialisation callback
      initialize: function () { /* noop */
      }
    },

    // List of the instancied plugins
    plugins: {},

    // This options are a merge between `defaults` and the options passed
    // through the constructor
    options: {},

    loadImageFromURL: function (image, callback) {
      fabric.Image.fromURL(image, function (oImg) {
        callback(oImg)
      }, this.imageOptions)
    },
    imageOptions: {

      // Some options to make the image static
      crossOrigin: 'Anonymous',
      selectable: false,
      evented: false,
      lockMovementX: true,
      lockMovementY: true,
      lockRotation: true,
      lockScalingX: true,
      lockScalingY: true,
      lockUniScaling: true,
      hasControls: false,
      hasBorders: false

    },
    initializePostImageLoad: function (element, sourceImage) {
      this._initializeDOM(element);
      this._initializeImage(sourceImage);

      // Then initialize the plugins
      this._initializePlugins(Darkroom.plugins);

      // Public method to adjust image according to the canvas
      this.refresh(function () {
        // Execute a custom callback after initialization
        this.options.initialize.bind(this).call();
      }.bind(this));
    },
    constructor: function (element, options, plugins) {
      this.options = Darkroom.Utils.extend(options, this.defaults);
      var self = this;
      var imageSrc;

      if (typeof element === 'string')
        element = document.querySelector(element);
      if (null === element)
        return;

      if(!this.options.fromURL) {
        imageSrc  = element.src
      }else{
        imageSrc = this.options.fromURL;
      }

      this.loadImageFromURL(imageSrc, function (oImage) {
        if (oImage) {
          self.initializePostImageLoad(element, oImage)
        } else {
          console.log("Retrying Loading with Fallback")
          self.loadImageFromURL(window._choicesrv + "/widget/v2/getImage?url=" + encodeURIComponent(imageSrc), function (oImageRetry) {
            self.initializePostImageLoad(element, oImageRetry)
          })
        }
      })

    },

    selfDestroy: function () {

      if(this.originalImageElement && this.originalImageElement.firstChild)
        this.originalImageElement.removeChild(this.originalImageElement.firstChild)

    },

    // Add ability to attach event listener on the core object.
    // It uses the canvas element to process events.
    addEventListener: function (eventName, callback) {
      var el = this.canvas.getElement();
      if (el.addEventListener) {
        el.addEventListener(eventName, callback);
      } else if (el.attachEvent) {
        el.attachEvent('on' + eventName, callback);
      }
    },

    dispatchEvent: function (eventName) {
      // Use the old way of creating event to be IE compatible
      // See https://developer.mozilla.org/en-US/docs/Web/Guide/Events/Creating_and_triggering_events
      var event = document.createEvent('Event');
      event.initEvent(eventName, true, true);

      this.canvas.getElement().dispatchEvent(event);
    },

    // Adjust image & canvas dimension according to min/max width/height
    // and ratio specified in the options.
    // This method should be called after each image transformation.
    refresh: function (next) {
      var clone = new Image();
      clone.onload = function () {
        this._replaceCurrentImage(new fabric.Image(clone));

        if (next) next();
      }.bind(this);
      clone.src = this.sourceImage.toDataURL();
    },

    _replaceCurrentImage: function (newImage) {
      if (this.image) {
        this.image.remove();
      }

      this.image = newImage;
      this.image.selectable = false;

      // Adjust width or height according to specified ratio
      var viewport = Darkroom.Utils.computeImageViewPort(this.image);
      var imageWidth = viewport.width;
      var imageHeight = viewport.height;

      if (null !== this.options.ratio) {
        var canvasRatio = +this.options.ratio;
        var currentRatio = imageWidth / imageHeight;

        if (currentRatio > canvasRatio) {
          imageHeight = imageWidth / canvasRatio;
        } else if (currentRatio < canvasRatio) {
          imageWidth = imageHeight * canvasRatio;
        }
      }

      var scaleX = 1;
      var scaleY = 1;

      if (null !== this.options.maxWidth && this.options.maxWidth < imageWidth) {
        scaleX = this.options.maxWidth / imageWidth;
      }
      else if (null !== this.options.minWidth && this.options.minWidth > imageWidth) {
        scaleX = this.options.minWidth / imageWidth;
      }


      if (null !== this.options.maxHeight && this.options.maxHeight < imageHeight) {
        scaleY = this.options.maxHeight / imageHeight;
      }
      else if (null !== this.options.minHeight && this.options.minHeight > imageHeight) {
        scaleY = this.options.minHeight / imageHeight;
      }

      var scaleMin = Math.min(scaleX, scaleY);

      // Finally place the image in the center of the canvas
      this.image.setScaleX(scaleMin);
      this.image.setScaleY(scaleMin);
      this.canvas.add(this.image);
      this.canvas.setWidth(this.options.maxWidth);
      this.canvas.setHeight(this.options.maxHeight);
      this.canvas.centerObject(this.image);
      this.image.setCoords();
    },

    // Apply the transformation on the current image and save it in the
    // transformations stack (in order to reconstitute the previous states
    // of the image).
    applyTransformation: function (transformation) {
      this.transformations.push(transformation);

      transformation.applyTransformation(
        this.sourceCanvas,
        this.sourceImage,
        this._postTransformation.bind(this)
      );
    },

    _postTransformation: function (newImage) {
      if (newImage)
        this.sourceImage = newImage;

      this.refresh(function () {
        this.dispatchEvent('core:transformation');
      }.bind(this));
    },

    // Initialize image from original element plus re-apply every
    // transformations.
    reinitializeImage: function () {
      this.sourceImage.remove();
      this._initializeImage();
      this._popTransformation(this.transformations.slice())
    },

    _popTransformation: function (transformations) {
      if (0 === transformations.length) {
        this.dispatchEvent('core:reinitialized');
        this.refresh();
        return;
      }

      var transformation = transformations.shift();

      var next = function (newImage) {
        if (newImage) this.sourceImage = newImage;
        this._popTransformation(transformations)
      };

      transformation.applyTransformation(
        this.sourceCanvas,
        this.sourceImage,
        next.bind(this)
      );
    },

    // Create the DOM elements and instanciate the Fabric canvas.
    // The image element is replaced by a new `div` element.
    // However the original image is re-injected in order to keep a trace of it.
    _initializeDOM: function (placementElement) {
      // Container
      var mainContainerElement = document.createElement('div');
      mainContainerElement.className = 'darkroom-container';


      // Viewport canvas
      var canvasContainerElement = document.createElement('div');
      canvasContainerElement.className = 'darkroom-image-container';
      var canvasElement = document.createElement('canvas');
      canvasContainerElement.appendChild(canvasElement);
      mainContainerElement.appendChild(canvasContainerElement);

      // Source canvas
      var sourceCanvasContainerElement = document.createElement('div');
      sourceCanvasContainerElement.className = 'darkroom-source-container';
      sourceCanvasContainerElement.style.display = 'none';
      var sourceCanvasElement = document.createElement('canvas');
      sourceCanvasContainerElement.appendChild(sourceCanvasElement);
      mainContainerElement.appendChild(sourceCanvasContainerElement);

      // Original image

      if(placementElement.firstChild) placementElement.removeChild(placementElement.firstChild)
      placementElement.appendChild(mainContainerElement);
      //imageElement.style.display = 'none';
      //mainContainerElement.appendChild(imageElement);
      this.originalImageElement = placementElement;

      // Instanciate object from elements
      this.containerElement = mainContainerElement;

      this.canvas = new fabric.Canvas(canvasElement, {
        selection: false,
        backgroundColor: this.options.backgroundColor
      });

      this.sourceCanvas = new fabric.Canvas(sourceCanvasElement, {
        selection: false,
        backgroundColor: this.options.backgroundColor
      });
    },

    // Instanciate the Fabric image object.
    // The image is created as a static element with no control,
    // then it is add in the Fabric canvas object.
    _initializeImage: function (sourceImage) {
//    this.sourceImage = new fabric.Image(this.originalImageElement, {
//      // Some options to make the image static
//      selectable: false,
//      evented: false,
//      lockMovementX: true,
//      lockMovementY: true,
//      lockRotation: true,
//      lockScalingX: true,
//      lockScalingY: true,
//      lockUniScaling: true,
//      hasControls: false,
//      hasBorders: false
//    });
      this.sourceImage = sourceImage;
      this.sourceCanvas.add(this.sourceImage);

      // Adjust width or height according to specified ratio
      var viewport = Darkroom.Utils.computeImageViewPort(this.sourceImage);
      var canvasWidth = viewport.width;
      var canvasHeight = viewport.height;

      this.sourceCanvas.setWidth(canvasWidth);
      this.sourceCanvas.setHeight(canvasHeight);
      this.sourceCanvas.centerObject(this.sourceImage);
      this.sourceImage.setCoords();
    },

    // Initialize every plugins.
    // Note that plugins are instanciated in the same order than they
    // are declared in the parameter object.
    _initializePlugins: function (plugins) {
      for (var name in plugins) {
        var plugin = plugins[name];
        var options = this.options.plugins[name];

        // Setting false into the plugin options will disable the plugin
        if (options === false)
          continue;

        // Avoid any issues with _proto_
        if (!plugins.hasOwnProperty(name))
          continue;

        this.plugins[name] = new plugin(this, options);
      }
    }
  }

})();

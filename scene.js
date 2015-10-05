/*
The MIT License (MIT)

Copyright (c) 2015 Copyleft Solutions AS

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

/**
 * @link github.com:copyleft/gravity-particle-profile
 * @copyright 2015 Copyleft Software AS
 * @author Anders Evenrud <andersevenrud@gmail.com>
 */
(function() {
  'use strict';

  /////////////////////////////////////////////////////////////////////////////
  // CONFIGURATION
  /////////////////////////////////////////////////////////////////////////////

  var debug              = true;

  var particle_count     = 2500;
  var particle_space     = 0.2;
  var particle_min_size  = 4;
  var particle_max_size  = 8;
  var particle_mass      = 0.01;
  var particle_rotation  = true;
  var particle_x_offset  = 0;

  var offscreen_render   = false;
  var offscreen_val      = 20;

  var force_count        = 1;
  var force_speed        = 0.015;
  var force_left         = 0.4;
  var force_right        = 0.75;
  var force_mass         = 40;
  var force_y_multiplier = 1.5;

  //var right_hand_force  = 0.4;
  //var brownian_forcing  = 0.5;
  var x_friction         = 0.99;
  var y_friction         = 0.95;
  var blur_amount        = 0.08;

  /////////////////////////////////////////////////////////////////////////////
  // GLOBALS
  /////////////////////////////////////////////////////////////////////////////

  var inited = false;
  var paused = false;
  var uiInited = false;

  var particles = [];
  var forces = [];

  var canvas;
  var ctx;

  var width;
  var height;

  var lastTick;
  var avgFPS = 60;
  var FPS = 0;
  var counter = 0.0;

  var mouseX = 0;
  var mouseY = 0;
  var maxVel = 7.5;

  var visibleParticles = 0;
  var burstCooldown = 0.0;

  /////////////////////////////////////////////////////////////////////////////
  // HELPERS
  /////////////////////////////////////////////////////////////////////////////

  /**
   * Radians to Degrees
   */
  function rad2deg(rad) {
    return rad * 180 / Math.PI;
  }

  /**
   * Random float min/max
   */
  function randomRange(min, max) {
    return ((Math.random() * (max - min)) + min);
  }

  /**
   * Random int min/max
   */
  function randomIntRange(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Vector Class
   */
  var Vector = (function () {
    function Vector(x, y) {
      this.x = x;
      this.y = y;
    }

    Vector.prototype = {
      lengthSquared: function(){
        return this.x*this.x + this.y*this.y;
      },
      length: function(){
        return Math.sqrt(this.lengthSquared());
      },
      add : function (vec) {
        return new Vector(this.x + vec.x, this.y + vec.y);
      },
      subtract : function (vec) {
        return new Vector(this.x - vec.x, this.y - vec.y);
      },
      multiply : function(scalar) {
        return new Vector (this.x * scalar, this.y * scalar);
      }
    };

    Vector.distance =  function(vec1,vec2){
      return (vec1.subtract(vec2)).length();
    }
    return Vector;
  })();

  /**
   * Adds a speparator to the container
   */
  function addSeparator() {
    var container = document.createElement('div');
    container.className = 'separator';
    document.getElementById('controls').appendChild(container);
  }

  /**
   * Adds a controller to the container
   */
  function addController(name, type, options, onUpdate) {
    options = options || {};

    var container = document.createElement('div');
    var label = document.createElement('label');

    function setLabel(val) {
      if ( type === 'checkbox' ) {
        val = val ? 'On' : 'Off';
      }

      label.innerHTML = name + ' (' + val.toString() + ')';
    }

    function onChange(ev) {
      var val = this.value;
      if ( type === 'checkbox' ) {
        val = !!this.checked;
      } else if ( type !== 'text' ) {
        val = parseInt(val, 10);
      }

      if ( ev ) {
        onUpdate(val);
      }
      setLabel(val);
    }

    if ( type === 'button' ) {
      var button = document.createElement('button');
      button.innerHTML = name;
      button.onclick = onUpdate;
      container.appendChild(button);
      document.getElementById('controls').appendChild(container);
      return;
    }

    var input = document.createElement('input');
    input.type = type;
    input.onchange = onChange;
    input.oninput = function(ev) {
      onChange.call(this, null);
    };

    Object.keys(options).forEach(function(key) {
      var val = options[key];
      if ( type === 'checkbox' && key === 'value' ) {
        key = 'checked';
        val = key;
      }

      input[key] = val;
    });

    container.appendChild(label);
    container.appendChild(input);
    document.getElementById('controls').appendChild(container);

    onChange.call(input);
  }

  /**
   * Generate SVG snapshot from current instance
   */
  function generateSVG() {
    paused = true;

    var xmlns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(xmlns, 'svg');
    svg.setAttribute('xmlns', xmlns);
    svg.setAttribute('version', '1.2');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);

    function _rect(p) {
      var s = p.size;
      var x = p.pos.x;
      var y = p.pos.y;
      var c = p.color;
      var r = rad2deg(p.angle);
      var mx = x;
      var my = y;

      if ( (x < 0 || x > width) || (y < 0 || y > height) ) return;

      var el = document.createElementNS(xmlns, 'rect');
      el.setAttribute('width', s);
      el.setAttribute('height', s);
      el.setAttribute('x', x);
      el.setAttribute('y', y);

      var fill = 'hsl(' + c.hue + ',' + c.sat + '%,' + c.lum + '%)';
      var style = 'fill: ' + fill;
      el.setAttribute('style', style);

      if ( particle_rotation ) {
        var transform = 'rotate(' + r + ', ' + mx + ', ' + my + ')';
        el.setAttribute('transform', transform);
      }

      svg.appendChild(el);
    }

    function _download() {
      var blob = new Blob([svg.outerHTML], {type: 'image/svg+xml'});
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.setAttribute('href', url);
      a.setAttribute('download', 'export.svg');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    particles.forEach(function(p) {
      _rect(p);
    });

    _download();

    paused = false;
  }

  function drawLine(x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  /////////////////////////////////////////////////////////////////////////////
  // PARTICLE
  /////////////////////////////////////////////////////////////////////////////

  function Particle(x, y, vx, vy, size) {
    // We pick a random position on the right side of the screen by default
    if ( typeof x !== 'number' ) {
      var d = Math.floor(width*(1.0 - particle_space));
      var r = randomIntRange(0, 100);
      x = d + randomIntRange(r, width - d - r);
      x += particle_x_offset;
    }

    if ( typeof y !== 'number' ) {
      y = randomIntRange(0, height);
    }

    this.ideal_pos = new Vector(x, y);
    this.pos       = new Vector(x, y);
    this.vel       = new Vector(vx || 0, vy || 0);
    this.target    = new Vector(0, 0);
    this.angle     = 0.0;
    this.size      = size || randomIntRange(particle_min_size, particle_max_size);
    this.mass      = randomRange(0.1, 1.0);
    this.lastColor = null;
    this.color     = {
      hue:   180,
      sat:   100,
      lum:   41,
      alpha: 1
    };
  }

  Particle.prototype.update = function update(dt) {
    var target     = this.target;
    var vel        = this.vel;
    var pos        = this.pos;
    var mass       = this.mass;
    var color      = this.color;
    var ideal_pos  = this.ideal_pos;

    var pmass      = particle_mass;
    if ( burstCooldown > 0.0 ) {
      pmass = 0.1;
    }

    var i;
    var force;
    var x_distance, y_distance, x_normalized, y_normalized, distance;

    // Rotate
    this.angle += 0.001 * dt;

    // Simulate point forces on particle
    for (i = 0 ; i < forces.length; i++) {
      force = forces [i];
      x_distance = (pos.x - force.pos.x) / width;
      y_distance = (pos.y - force.pos.y) / height;
      distance = Math.sqrt (x_distance * x_distance + y_distance * y_distance);
      x_normalized = x_distance / distance;
      y_normalized = y_distance / distance;

      vel.x += force_mass * pmass * mass * (x_normalized * x_normalized) * (x_distance > 0 ? 1 : -1);
      vel.y += force_mass * pmass * mass * (y_normalized * y_normalized) * force_y_multiplier * (y_distance > 0 ? 1 : -1);
    }

    // Simulate static force force
    x_distance = (pos.x - ideal_pos.x) / width;
    y_distance = (pos.y - ideal_pos.y) / height;
    distance = Math.sqrt (x_distance * x_distance + y_distance * y_distance) + 0.1;
    x_normalized = x_distance / distance;
    y_normalized = y_distance / distance;

    vel.x -= force_mass * 8 * pmass * mass * (x_normalized * x_normalized) * (x_distance > 0 ? 1 : -1);
    vel.y -= force_mass * 8 * pmass * mass * (y_normalized * y_normalized) * force_y_multiplier * (y_distance > 0 ? 1 : -1);

    // Simulate friction
    vel.x *= x_friction;
    vel.y *= y_friction;

    // Update position
    pos.x += vel.x;
    pos.y += vel.y;

    if ( !offscreen_render && ((pos.x < -offscreen_val || pos.x > width+offscreen_val) || (pos.y < -offscreen_val || pos.y > height+offscreen_val)) ) {
      return false;
    }

    // Update color
    var vel = Math.abs(this.vel.x) + Math.abs(this.vel.y);
    //if ( vel > maxVel ) maxVel = vel;
    var scale = (vel - 0.001) / (maxVel - 0.001);

    if ( scale > 1.0 ) scale = 1.0;
    if ( scale < 0.0 ) scale = 0.0;

    function _get(to, from) {
      return (from * scale + to * (1.0 - scale))
    }

    color.hue = _get(180, 240);
    color.sat = _get(100, 84);
    color.lum = _get(41, 47);

    return true;
  };

  Particle.prototype.render = function(dt) {
    var s = this.size;
    var a = this.angle;
    var x = this.pos.x;
    var y = this.pos.y;
    var c = this.color;

    var fill = 'hsl(' + c.hue + ',' + c.sat + '%,' + c.lum + '%)';
    if ( this.lastColor != fill ) {
      ctx.fillStyle = fill;
    }
    this.lastColor = fill;

    if ( particle_rotation ) {
      ctx.save();
      ctx.translate(x-(s/2), y-(s/2));
      ctx.rotate(a);
      ctx.fillRect(-s/2, -s/2, s, s);
      ctx.restore();
    } else {
      ctx.fillRect(x, y, s, s);
    }
  };

  /////////////////////////////////////////////////////////////////////////////
  // Force
  /////////////////////////////////////////////////////////////////////////////

  function Force(isMouse) {
    this.x_factor = randomRange(0.1, 0.5);
    this.y_factor = randomRange(0.5, 1.0);
    this.isMouse  = isMouse;

    Particle.call(this, 0, 0, randomRange(0, 0.75), randomRange(0, 0.75), 10);
  }

  Force.prototype = Object.create(Particle.prototype);

  Force.prototype.update = function update(dt) {
    var target = this.target;
    var vel    = this.vel;
    var pos    = this.pos;

    if ( this.isMouse ) {
      pos.x = mouseX;
      pos.y = mouseY;
      return;
    }

    var px = width*force_left;
    var x  = ((width)*force_right) - px;
    var xc = counter * this.x_factor % Math.PI*2;
    var yc = counter * this.y_factor % Math.PI*2;

    pos.x = px + (x * (1 + Math.sin(xc)) / 2);
    pos.y = height * (1 + Math.sin(yc)) / 2;
  };

  Force.prototype.render = function(dt) {
    if ( !debug ) return;

    var pos    = this.pos;
    var s      = this.size;
    var r      = this.isMouse ? 255 : 0;
    ctx.fillStyle = 'rgba(' + r.toString() + ', 0, 0, .5)';

    //ctx.fillRect(pos.x, pos.y, s, s);

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, s/2, 0, 2*Math.PI, false);
    ctx.fill();
    ctx.closePath();
  };

  /////////////////////////////////////////////////////////////////////////////
  // EVENTS
  /////////////////////////////////////////////////////////////////////////////

  /**
   * Runs Every Frame
   */
  function tick() {
    if ( !inited || paused ) return;

    var now = Date.now();
    var dt  = now - lastTick;
    FPS = 1000 / dt;
    avgFPS = (avgFPS * 0.9) + (FPS * (1 - 0.9));

    var blur = (1.0 - blur_amount).toFixed(2).toString();
    //ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255, 255, 255, ' + blur + ')';
    ctx.fillRect(0, 0, width, height);

    visibleParticles = 0;

    if ( debug ) {
      var x;

      x = width * force_left;
      drawLine(x, 0, x, height, 'rgba(0, 255, 0, .1)');

      x = width * force_right;
      drawLine(x, 0, x, height, 'rgba(0, 0, 255, .1)');

      x = width * (1.0 - particle_space);
      drawLine(x, 0, x, height, 'rgba(255, 0, 0, .1)');
    }

    var count;
    for (count = particle_count; count-- ; ) {
      if ( particles[count].update(dt) ) {
        particles[count].render(dt);
        visibleParticles++;
      }
    }

    for ( count = force_count + 1; count-- ; ) {
      forces[count].update(dt);
      forces[count].render(dt);
    }

    if ( debug ) {
      var txt = ([
        avgFPS.toFixed(2).toString() + ' FPS',
        dt.toString() + ' ms',
        visibleParticles.toString() + '/' + particle_count.toString() + ' visible particles',
        force_count.toString() + ' force(s)',
        'X:' + mouseX.toString() + ' Y:' + mouseY.toString()
      ]).join(' | ');

      ctx.lineWidth = 1;
      ctx.fillStyle = '#000000';
      ctx.font = '12px Monospace';
      ctx.fillText(txt, 10, 20);
    }

    if ( burstCooldown > 0.0 ) {
      burstCooldown -= dt / 100;
      if ( burstCooldown <= 0.0 ) {
        burstCooldown = 0.0;
      }
    }

    lastTick = now;
    counter += force_speed;

    requestAnimationFrame(tick);
  }

  /**
   * Initialize Main
   */
  function init() {
    if ( inited ) return;

    canvas = document.getElementById('canvas');
    ctx    = canvas.getContext('2d');
    inited = true;

    canvas.addEventListener('contextmenu', function(ev) {
      ev.preventDefault();
      return false;
    }, false);

    resize();
    initUI();
    initSimulation();
  }

  /**
   * Initialize Simulation
   */
  function initSimulation() {
    var count;

    lastTick = Date.now();

    forces = [new Force(true)];
    for ( count = force_count; count-- ; ) {
      forces.push(new Force());
    }

    particles = [];
    for ( count = particle_count; count-- ; ) {
      particles.push(new Particle());
    }

    inited = true;
    paused = false;
    tick();
  }

  /**
   * Initialize UI
   */
  function initUI() {
    if ( uiInited ) return;

    addController('Particle Rotation', 'checkbox', {
      value : particle_rotation
    }, function(value) {
      particle_rotation = value;
    });

    addController('Max Particle Count', 'range', {
      min: 1,
      max: 10000,
      value: particle_count
    }, function(value) {
      paused = true;
      particle_count = value;
      reset();
    });

    addController('Particle Mass', 'range', {
      min: 1,
      max: 100,
      value: particle_mass * 1000
    }, function(value) {
      particle_mass = value / 1000;
    });

    addController('Particle Min Size px', 'range', {
      min: 1,
      max: 10,
      value: particle_min_size
    }, function(value) {
      paused = true;
      particle_min_size = value;
      reset();
    });

    addController('Particle Max Size px', 'range', {
      min: 5,
      max: 10,
      value: particle_max_size
    }, function(value) {
      paused = true;
      particle_max_size = value;
      reset();
    });

    addSeparator();

    addController('Cloud Size %', 'range', {
      min: 1,
      max: 100,
      value: particle_space * 100
    }, function(value) {
      paused = true;
      particle_space = value / 100;
      reset();
    });

    addController('Cloud X-offset px', 'range', {
      min: -256,
      max: 256,
      value: particle_x_offset
    }, function(value) {
      paused = true;
      particle_x_offset = value;
      reset();
    });

    addSeparator();

    /*
    addController('Right Hand Force', 'range', {
      min: 0,
      max: 100,
      value: right_hand_force * 100
    }, function(value) {
      right_hand_force = value / 100;
    });

    addController('Brownian Forcing', 'range', {
      min: 0,
      max: 100,
      value: brownian_forcing * 100
    }, function(value) {
      brownian_forcing = value / 100;
    });
    */
    /*
    addController('Force Count', 'range', {
      min: 1,
      max: 10,
      value: force_count
    }, function(value) {
      paused = true;
      force_count = value;
      reset();
    });
    */

    addController('Force min X-pos %', 'range', {
      min: 0,
      max: 100,
      value: force_left * 100
    }, function(value) {
      force_left = value / 100;
    });

    addController('Force max X-pos %', 'range', {
      min: 0,
      max: 100,
      value: force_right * 100
    }, function(value) {
      force_right = value / 100;
    });

    addController('Force Mass', 'range', {
      min: 0,
      max: 100,
      value: force_mass
    }, function(value) {
      force_mass = value;
    });

    addController('Force Y multiplier', 'range', {
      min: 0,
      max: 200,
      value: force_y_multiplier * 100
    }, function(value) {
      force_y_multiplier = value / 100;
    });

    addController('Force Speed', 'range', {
      min: 1,
      max: 128,
      value: force_speed * 1000
    }, function(value) {
      force_speed = value / 1000;
    });

    addSeparator();

    addController('X friction', 'range', {
      min: 0,
      max: 100,
      value: x_friction * 100
    }, function(value) {
      x_friction = value / 100;
    });

    addController('Y friction', 'range', {
      min: 0,
      max: 100,
      value: y_friction * 100
    }, function(value) {
      y_friction = value / 100;
    });

    addSeparator();

    addController('Generate SVG snapshot', 'button', {
    }, function(value) {
      generateSVG();
    });

    uiInited = true;

    document.getElementById('controls').style.display = debug ? 'block' : 'none';
    document.getElementById('controls').addEventListener('click', function(ev) {
      ev.stopPropagation();
      return false;
    }, false);
    document.getElementById('controls').addEventListener('mousedown', function(ev) {
      ev.stopPropagation();
      return false;
    }, false);
  }

  /**
   * Resets the simulation
   */
  var reset = (function() {
    var _t;

    function _reset() {
      paused = true;
      initSimulation();
    }

    // Make sure reset only gets called every 20ms
    return function() {
      if ( _t ) {
        _t = clearTimeout(_t);
      }
      _t = setTimeout(function() {
        _reset();
      }, 20);
    };
  })();

  /**
   * When browser unloads (or leaves)
   */
  function unload() {
    inited = false;
    paused = true;
  }

  /**
   * Handles Window Resizing
   */
  function resize(ev) {
    if ( !inited ) return;
    width  = canvas.width  = window.innerWidth;
    height = canvas.height = window.innerHeight;

    if ( ev ) {
      inited = false;
      reset();
    }
  }

  /**
   * Handles Mouse Movment
   */
  function mousemove(ev) {
    if ( !inited ) return;
    mouseX = ev.clientX;
    mouseY = ev.clientY;
  }

  /**
   * Handles Mouse Clicks
   */
  var mouseclick = (function() {
    var _t;

    function _click() {
      if ( burstCooldown <= 0.0 ) burstCooldown = 2.0;
    }

    return function() {
      if ( _t || !inited || paused ) return;

      _click();
      _t = setTimeout(function() {
        _t = clearTimeout(_t);
      }, 1200);
    };
  })();

  /**
   * Handles Key Presses
   */
  function keydown(ev) {
    if ( !inited ) return;

    var k = ev.keyCode || ev.which;
    if ( k !== 68 ) return; // "D"

    debug = !debug;
    document.getElementById('controls').style.display = debug ? 'block' : 'none';
  }

  /////////////////////////////////////////////////////////////////////////////
  // BIND
  /////////////////////////////////////////////////////////////////////////////

  document.addEventListener('click', mouseclick, false);
  document.addEventListener('keydown', keydown, false);
  document.addEventListener('mousemove', mousemove, false);
  document.addEventListener('load', init, false);
  document.addEventListener('DOMContentLoaded', init, false);
  window.addEventListener('resize', resize, false);

  window.onunload = unload;
  window.onbeforeunload = unload;
})();

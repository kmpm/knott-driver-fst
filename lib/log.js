var util = require('util');

var LEVELS = ['ERROR', 'WARN', 'INFO', 'DEBUG'];

var Log = module.exports = function() {
  var i;
  this.level = LEVELS.indexOf('DEBUG');
  for (i = 0; i < LEVELS.length; i++){
    createMethod.call(this, i);  
  }
}


function createMethod (index) {
  var NAME = LEVELS[index];
  var name = NAME.toLowerCase();
  var self = this;
  this[name] = function(/*arguments*/){
    if (this.level < index) return;
    console.log(util.format("%s %s\t %s", (new Date()).toJSON(), NAME, util.format.apply(undefined, arguments)));
  };
}

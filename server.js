var mqtt = require('mqttjs'),
    easyip = require('easyip'),
    os = require('os'),
    Log = require('knott-driver').Log,
    Pid = require('knott-driver').Pid;


//load config file
var config = require('./config.json'),
    log = new Log(), 
    pid = new Pid(config);

log.level = config.loglevel || 3;
process.title = "knott-driver-fst";




var ctopic = "/config/fst/deviceinfo/" + config.device_id + "/";

var subscribe, unsubscribe;

var service = new easyip.Service();
service.on('listening', function(){
  log.info("easyip is online");
  pid.downgrade(function(uid, gid){
    log.info("running as %s:%s", uid, gid); 
  });
  getConfig();
});


service.bind();
/*
 * Config
 */
function getConfig(){
  mqtt.createClient(config.mqtt.port, config.mqtt.host, function(err, client){
    if(err){
      log.error("mqtt config creation error", err);
      process.exit(1);
    }
    client.connect({keepalive:config.mqtt.keepalive || 30000});

    client.on('error', function(err){
      log.error("mqtt error", err);
    });

    client.on('connack', function(){
      log.info("Connected to mqtt config", config.mqtt);
      var topic = ctopic + '#';
      client.subscribe({topic:topic});
      client.publish({topic:ctopic + "booted" ,retain:true, payload:(new Date()).toString()});
    });

    client.on('publish', function(packet){
      var topics = packet.topic.replace(ctopic, '').split('/');
      //log.debug("topics", topics);
      var key = topics[0];
      config[topics[0]]=packet.payload;
      //log.debug(key.substring(0,2));
      if(key.substring(0,2) === 'fw'){
        if(packet.payload.length > 0){
          subscribe(key, packet.payload);
        } 
        else {
         unsubscribe(key); 
        }
      }
    });
  });
}


function hartbeat(mqclient){
  mqclient.publish({topic:'/config/fst/nodes/' + config.device_id +  "/hartbeat", payload:(new Date).toJSON(), retain:true});  
}


/*
 * Data
 */
mqtt.createClient(config.mqtt.port, config.mqtt.host, function(err, client){
  var index = {};
  if(err){
    log.debug("mqtt client creation error", err);
    process.exit(1);
  }
  client.connect({keepalive:config.mqtt.keepalive || 30000});

	client.on('connack', function(packet){
		log.info("Connected to mqtt data", config.mqtt);
    client.publish({topic:'/config/fst/nodes/' + config.device_id +  "/hostname", payload:os.hostname(), retain:true});  
    hartbeat(client);
    setInterval(hartbeat, 30000, client);
	});
  client.on('error', function(err){
    log.debug("mqtt error", err);
  });
  subscribe = function(address, topic){
    log.info(address, 'getting values from', topic); 
    index[topic]=address;
    client.subscribe({topic:topic});
  };

  unsubscribe = function(address){
    var topic;
    var toRemove;
    for(topic in index){
      if(index[topic] === address){
        log.info(address, "no longer getting values from", topic);
        client.unsubscribe('topic');
        toRemove=topic;
        continue;
      }
    }
    if(index.hasOwnProperty(toRemove)){
      delete index[toRemove];
    }
  }

  client.on('publish', function(packet){

    if(index.hasOwnProperty(packet.topic)){
      var address = parseInt(index[packet.topic].substring(2), 10);
      //make value with 1 decimal without decimal separator. 15.2 = 152
      var value = Math.round(parseFloat(packet.payload) * 10);
      //log.debug("setting fw", address, "to", value);
      service.storage.set(easyip.OPERANDS.FLAGWORD, address , value);
    }
  });
  service.storage.on('changed', function(operand, index, prev, now){
    log.info("fw", index, "changed to", now);
    client.publish({topic:'/raw/fst/' + config.device_id + '/fw' + index, retain:true, payload:now});
  });
});

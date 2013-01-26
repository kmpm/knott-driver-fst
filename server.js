var mqtt = require('mqttjs'),
    easyip = require('easyip'),
    os = require('os');


//load config file
var config = require('./config.json');

var ctopic = "/config/fst/deviceinfo/" + config.device_id + "/";

var subscribe, unsubscribe;

var service = new easyip.Service();
service.on('listening', function(){
  console.log("easyip is online");
  getConfig();
});


service.bind();
/*
 * Config
 */
function getConfig(){
  mqtt.createClient(config.mqtt.port, config.mqtt.host, function(err, client){
    if(err){
      console.log("mqtt client creation error", err);
      process.exit(1);
    }
    client.connect({keepalive:config.mqtt.keepalive || 30000});

    client.on('error', function(err){
      console.log("mqtt error", err);
    });

    client.on('connack', function(){
      console.log("connected to mqtt", config.mqtt);
      var topic = ctopic + '#';
      client.subscribe({topic:topic});
      client.publish({topic:ctopic + "booted" ,retain:true, payload:(new Date()).toString()});
    });

    client.on('publish', function(packet){
      var topics = packet.topic.replace(ctopic, '').split('/');
      console.log("topics", topics);
      var key = topics[0];
      config[topics[0]]=packet.payload;
      console.log(key.substring(0,2));
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
    console.log("mqtt client creation error", err);
    process.exit(1);
  }
  client.connect({keepalive:config.mqtt.keepalive || 30000});

	client.on('connack', function(packet){
		console.log("Connected to mqtt");
    client.publish({topic:'/config/fst/nodes/' + config.device_id +  "/hostname", payload:os.hostname(), retain:true});  
    hartbeat(client);
    setInterval(hartbeat, 30000, client);
	});
  client.on('error', function(err){
    console.log("mqtt error", err);
  });
  subscribe = function(address, topic){
    console.log("listening", address, topic);
    index[topic]=address;
    client.subscribe({topic:topic});
  };

  unsubscribe = function(address){
    var topic;
    var toRemove;
    for(topic in index){
      if(index[topic] === address){
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
      var value = Math.round(parseFloat(packet.payload)*100);
      console.log("setting fw", address, "to", value);
      service.storage.set(easyip.OPERANDS.FLAGWORD, address , value);
    }
  });
  service.storage.on('changed', function(operand, index, prev, now){
    console.log("storage changed", operand, index, now);
    client.publish({topic:'/raw/fst/' + config.device_id + '/fw' + index, retain:true, payload:now});
  });
});

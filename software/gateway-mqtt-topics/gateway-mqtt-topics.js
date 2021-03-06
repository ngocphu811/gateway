#!/usr/bin/env node
/*

Takes the stream of packets from the BLE gateway and makes individual
streams out of them.

- So, this packet from the gateway:

    {
      device: 'MyDevice',
      data1: 17,
      id: 4379289
    }

  gets published to the topic:

    device/MyDevice/4379289

  at the same MQTT broker.

- To get all devices of type "MyDevice", subscribe to:

    device/MyDevice/+

- This script uses mDNS-SD to find a nearby MQTT broker to use for
  this purpose.
*/

// Try to shutup some of the annoying avahi warnings.
process.env['AVAHI_COMPAT_NOWARN'] = 1;

var mqtt = require('mqtt');


// Main data topic
var TOPIC_MAIN_STREAM = 'gateway-data';

// Topic prefix for all data-specific topics that are created
var TOPIC_PREFIX_DEVICE = 'device/';

// List of all topics the BLE gateway is supporting
var TOPIC_TOPICS = 'gateway-topics';

// How long without hearing a timeout do we call the topic dead (in ms)
var TOPIC_TIMEOUT = 1000*60*5; // 5 minutes


// Keep track of the list of all topics are already advertising
var advertising_topics = [];

// Keep track of the timeouts to remove stale topics
var topic_timeouts = {};


// Callback after we have found a MQTT broker.
var mqtt_client = mqtt.connect('mqtt://localhost');
mqtt_client.on('connect', function () {
    console.log('Connected to MQTT');

    // On connect we subscribe to all formatted data packets
    mqtt_client.subscribe(TOPIC_MAIN_STREAM);

    // Called when we get a packet from MQTT
    mqtt_client.on('message', function (topic, message) {
        // message is Buffer
        var adv_obj = JSON.parse(message.toString());

        // We only know how to handle packets in a certain format (contain
        // key named "device")
        if ('device' in adv_obj) {

            var topic_name_device = TOPIC_PREFIX_DEVICE + adv_obj.device + '/' + adv_obj._meta.device_id;
            if (advertising_topics.indexOf(topic_name_device) == -1) {
                advertising_topics.push(topic_name_device);

                // Publish new topics list
                publish_advertising_topics();
            }

            // Actually publish this to a topic stream
            mqtt_client.publish(topic_name_device, message);

            // Keep track of this so we get rid of old, stale topics
            update_timeout(topic_name_device);
        }
    });

    //
    // Helper functions for managing known topics
    //

    function remove_from_advertising_topics (topic_name) {
        var index = advertising_topics.indexOf(topic_name);
        if (index > -1) {
            advertising_topics.splice(index, 1);
        }
    }

    function update_timeout (topic_name) {
        if (topic_name in topic_timeouts) {
            clearTimeout(topic_timeouts[topic_name]);
        }

        topic_timeouts[topic_name] = setTimeout(function () {
            // If this ever fires, remove from array
            remove_from_advertising_topics(topic_name);

            // And publish new list
            publish_advertising_topics();
        }, TOPIC_TIMEOUT);
    }

    function publish_advertising_topics () {
        mqtt_client.publish(TOPIC_TOPICS, JSON.stringify(advertising_topics), {retain: true});
    }

});

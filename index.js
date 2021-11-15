const util = require('util')
const _ = require('lodash')
var sourceAddress = '1'
var globalOptions = []
var mmsi;

module.exports = function (app) {
  var plugin = {}
  var unsubscribes = []
  var timers = []

  plugin.id = 'signalk-beacon-mob-plugin';
  plugin.name = 'BLE beacon MOB plugin';
  plugin.description = 'Use BLE beacons to track crew and raise MOB alert (PGN) when a beacon goes out of range';

  plugin.start = function (options, restartPlugin) {
    // Here we put our plugin logic
    app.debug('Plugin started');

    mmsi = app.getSelfPath('mmsi')
    app.debug('mmsi: %d', mmsi)

    globalOptions = options;


    let localSubscription = {
      context: '*', // Get data for all contexts
      subscribe: [{
        path: 'navigation.position', // Get GPS coordinates
        period: 500 // Every 500ms
      }]
    };

    app.subscriptionmanager.subscribe(
      localSubscription,
      unsubscribes,
      subscriptionError => {
        app.error('Error:' + subscriptionError);
      },
      delta => {
        delta.updates.forEach(u => {
          // app.debug(u);
        });
      }
    );

    timers.push(setTimeout(() => {
      sendMOBpgn(); 
    }, 5000))
  };



  plugin.stop = function () {
    // Here we put logic we need when the plugin stops
    app.debug('Plugin stopped');
    plugin.stop = function () {
      unsubscribes.forEach(f => f());
      unsubscribes = [];
      timers.forEach(timer => {
        clearInterval(timer)
      }) 
    };

  };

function sendMOBpgn () {
/*
    {"Man Overboard Notification",
     127233,
     PACKET_COMPLETE,
     PACKET_FAST,
     35,
     0,
     {{"SID", BYTES(1), 1, false, 0, ""},
      {"MOB Emitter ID", BYTES(4), RES_INTEGER, false, 0, "Identifier for each MOB emitter, unique to the vessel"},
      {"Man Overboard Status",
       3,
       RES_LOOKUP,
       false,
       ",0=MOB Emitter Activated,1=Manual on-board MOB Button Activation,2=Test Mode,3=MOB Not Active",
       ""},
      {"Reserved", 5, RES_BINARY, false, 0, ""},
      {"Activation Time", BYTES(4), RES_TIME, false, "s", "Time of day (UTC) when MOB was activated"},
      {"Position Source", 3, RES_LOOKUP, false, ",0=Position estimated by the Vessel,1=Position reported by MOB emitter", ""},
      {"Reserved", 5, RES_BINARY, false, 0, ""},
      {"Position Date", BYTES(2), RES_DATE, false, "", "Date of MOB position"},
      {"Position Time", BYTES(4), RES_TIME, false, "s", "Time of day of MOB position (UTC)"},
      {"Latitude", BYTES(4), RES_LATITUDE, true, "deg", ""},
      {"Longitude", BYTES(4), RES_LONGITUDE, true, "deg", ""},
      {"COG Reference", 2, RES_LOOKUP, false, LOOKUP_DIRECTION_REFERENCE, ""},
      {"Reserved", 6, RES_BINARY, false, 0, ""},
      {"COG", BYTES(2), RES_RADIANS, false, "rad", ""},
      {"SOG", BYTES(2), 0.01, false, "m/s", ""},
      {"MMSI of vessel of origin", BYTES(4), RES_INTEGER, false, "MMSI", ""},
      {"MOB Emitter Battery Status", 3, RES_LOOKUP, false, ",0=Good,1=Low", ""},
      {"Reserved", 5, RES_BINARY, false, 0, ""},
      {0}}}
*/

      const datetime = new Date(app.getSelfPath('navigation.datetime.value'))
      app.debug('Date: %s', datetime)
      app.debug('Seconds: %d', secToday(datetime))

      const myPos = app.getSelfPath('navigation.position.value')
      app.debug('my pos %j', myPos)

      const commandPgn = {
        "pgn":127233,
        "dst": 255,
        "prio":3,
        "fields":{
          "SID": 0,
          "MOB Emitter ID": 1234567,
          "Man Overboard Status": 2,
          "Reserved": 0,
          "Activation Time": secToday(datetime),
          "Position Source": 0,
          "Position Date": daysToday(datetime),
          "Position Time": secToday(datetime),
          "Latitude": myPos.latitude,
          "Longitude": myPos.longitude,
          "COG Reference": 0,
          "Reserved": 0,
          "COG": 0,
          "SOG": 0,
          "MMSI of vessel of origin": mmsi,
          "MOB Emitter Battery Status": 0,
          "Reserved": 0
        }
      }

      setTimeout(function(){
        app.debug('sending command %j', commandPgn)
        app.emit('nmea2000JsonOut', commandPgn)
      }, 1000)
    }

  plugin.schema = {
    // The plugin schema
    title: 'Signal K - Beacon crew Man Over Board alert',
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        title: 'Add beacons',
        items: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              title: 'Beacon',
            },
            path: {
              type: 'string',
              title: 'Crew name',
            },
          },
        },
      },
    }
  };
  return plugin;

};

function padd(n, p, c)
{
  var pad_char = typeof c !== 'undefined' ? c : '0';
  var pad = new Array(1 + p).join(pad_char);
  return (pad + n).slice(-pad.length);
}


function radToDeg(radians) {
  return radians * 180 / Math.PI
}

function radToHex(rad) {
  if (rad< 0) {
    rad += (2 * Math.PI)
  }
  return intToHex(Math.trunc(rad*10000))
}

function degToHex(degrees) {
  return radToHex(degToRad(degrees))
}

function degToRad(degrees) {
  return degrees * (Math.PI/180.0);
}

function intToHex(integer) {
	var hex = padd((integer & 0xff).toString(16), 2) + "," + padd(((integer >> 8) & 0xff).toString(16), 2)
  return hex
}

function secToday (d) {
  var e = new Date(d);
  return Math.round(((d - e.setHours(0,0,0,0)) / 1000));
}

function daysToday (d) {
  var e = new Date(d);
  return Math.round((e/1000) / 86400);
}

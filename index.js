const util = require('util')
const noble = require('@abandonware/noble');
const _ = require('lodash')
var Chipolo = require('chipolo');

var sourceAddress = '1'
var globalOptions = []
var alert = 0
var MOBsent = false

module.exports = function (app) {
  var plugin = {}
  var unsubscribes = []
  var timers = []

  plugin.id = 'signalk-beacon-mob-plugin';
  plugin.name = 'BLE beacon MOB plugin';
  plugin.description = 'Use BLE beacons to track crew and raise AIS MOB alert (PGN) when a beacon goes out of range';

  plugin.start = function (options, restartPlugin) {
    // Here we put our plugin logic
    app.debug('Plugin started');
    var currentGPS
    var mmsi = randomMMSI()

    app.debug('MMSI: %d  MOBsent: %s', mmsi, MOBsent);
    globalOptions = options

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
      alert = 1; 
    }, 10000))
    timers.push(setTimeout(() => {
      alert = 1; 
    }, 60000))
    
    timers.push(setTimeout(() => {
      mmsi = randomMMSI()
    }, 30000))

    timers.push(setTimeout(() => {
      alert = 0; 
    }, 20000))
    timers.push(setTimeout(() => {
      alert = 0; 
    }, 70000))

    timers.push(setInterval(() => {
      checkBeacons(mmsi, MOBsent);
    }, 500))
    
  };

	
	noble.on('stateChange', async (state) => {
	  if (state === 'poweredOn') {
      app.debug('noble poweredOn');
	    await noble.startScanningAsync([], false);
	  }
	});
	noble.on('discover', async (peripheral) => {
    app.debug('noble discover');
	  await noble.stopScanningAsync();
	  await peripheral.connectAsync();
	  // const {characteristics} = await peripheral.discoverSomeServicesAndCharacteristicsAsync(['180f'], ['2a19']);
	  // const batteryLevel = (await characteristics[0].readAsync())[0];
	
	  // app.debug(`${peripheral.address} (${peripheral.advertisement.localName}): ${batteryLevel}%`);
	  app.debug("%s %s: %j", peripheral.address, peripheral.advertisement.localName, util.inspect(peripheral));
	
	  await peripheral.disconnectAsync();
  });

  Chipolo.discover(function(chipolo) {
    app.debug('Found chipolo %s', chipolo.toString());

    chipolo.on('disconnect', function(chipolo) {
      app.debug('Disconnected from %{s}!', chipolo.toString());
    });
  });

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

  function randomMMSI () {
    const random = (Math.floor(Math.random() * 998) + 1).toString()
    const mmsi = Number("972777" + (('000' + random).slice(-3)))
    app.debug("Generate random MMSI: %d", mmsi)
    return mmsi
  }

  function checkBeacons (mmsi) {
    var currentGPS = currentGPSPosition();
    if (alert == 1) {
      app.debug("We have an MOB! Alerting using MMSI %s MOBsent %s", mmsi, MOBsent)
      sendMOBPositionPGN(mmsi, currentGPS)
      if (MOBsent == false) {
        sendMOBAlertpgn(mmsi)
        MOBsent = true
      }
    }
  }

  function currentGPSPosition () {
    return app.getSelfPath('navigation.position.value')
  }

  function sendMOBPositionPGN (mmsi, gpsPosition) {
    //const datetime = new Date(app.getSelfPath('navigation.datetime.value'))

    const PGN_129038 = {
      "pgn": 129038,
      "dst": 255,
      "prio":3,
      "fields":{
        "Message ID": 0,
        "Repeat Indicator": 0,
        "User ID": mmsi,
        "Latitude": gpsPosition.latitude,
        "Longitude": gpsPosition.longitude,
        "Position Accuracy": 0, 
        "RAIM": 0,
        "Time Stamp": 60,
        "COG": 0,
        "SOG": 0,
        // "Communication State": ,
        "AIS Transceiver information": 4,
        // "Heading": 0,
        // "Rate of Turn": 0,
        "Nav Status": 14,
        "Special Maneuver Indicator": 0,
        // "AIS Spare": "",
        "Sequence ID": 0
      }
    }

    setTimeout(function(){
      app.debug('sending command %j', PGN_129038)
      app.emit('nmea2000JsonOut', PGN_129038)
    }, 1000)
  }

  function sendMOBAlertpgn (mmsi) {
    const PGN_129802 = {
      "pgn": 129802,
      "dst": 255,
      "prio":3,
      "fields":{
        "Message ID": 0,
        "Repeat Indicator": 0,
        "Source ID": mmsi,
        "AIS Transceiver information": 4,
        "Safety Related Text": "MOB alert"
      }
    }

    setTimeout(function(){
      app.debug('sending command %j', PGN_129802)
      app.emit('nmea2000JsonOut', PGN_129802)
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

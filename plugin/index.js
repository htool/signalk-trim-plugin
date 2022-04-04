const _ = require("lodash")
const url = require('url')
const radToDeg = 57.29577
const mpsToKnots = 1.94384
var fs = require('fs')
var path = require('path')
var plugin = {}

module.exports = function(app, options) {
  "use strict"
  var plugin = {}
  plugin.id = "signalk-trim-plugin"
  plugin.name = "Sail Trim plugin"
  plugin.description = "Signal K server plugin that helps with trim. Auto detects conditions and allows custom markers."

  var unsubscribes = []

  var schema = {
    type: "object",
    title: plugin.name,
    description: plugin.description,
    properties: {

      sails: {
	      type: 'array',
	      title: 'Add sails and performance related parts',
	      items: {
	        type: 'object',
	        properties: {
	          sail: {
	            type: 'string',
	            title: 'Sail name',
	            default: 'Main'
	          },
            parts: {
	            type: 'array',
	            title: 'Performance related parts',
              description: 'Markers comma seperated list.\n E.g. 1,2,3,4,5,6,7,8,9,10,11,12,13,14,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30 or A,B,C,D,E,F,G,H,I.J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z or White,Blue,Green,Red,Black,Pink,Orange,Yellow,Grey,Purple',
	            items: {
	              type: 'object',
	              properties: {
	                part: {
	                  type: 'string',
	                  title: 'Part name',
	                  default: 'Sheet'
	                },
	                markers: {
	                  type: 'string',
	                  title: 'Markers',
	                  default: 'White,Blue,Green,Red,Black,Pink,Orange,Yellow,Grey,Purple'
	                }
                }
              }
            }
          }
        }
      },

	    wavePath: {
	      type: 'string',
	      title: 'Numeric source for wave information. Attitude takes pitch/trim.',
	      default: 'navigation.attitude'
	    },
      wave: {
	      type: 'array',
	      title: 'Add wave ranges and names',
	      items: {
	        type: 'object',
	        properties: {
	          type: {
	            type: 'string',
	            title: 'Wave type name',
	            default: 'No or little waves'
	          },
	          min: {
	            type: 'number',
              description: 'Range minimum for Trim value',
	            title: 'Trim min (degrees)'
	          },
	          max: {
	            type: 'number',
              description: 'Range maximum for Trim value',
	            title: 'Trim max (degrees)'
	          }
          }
        }
      },

	    windSpeedPath: {
	      type: 'string',
	      title: 'Numeric source for wind speed information',
	      default: 'environment.wind.speedTrue'
	    },
      windSpeed: {
	      type: 'array',
	      title: 'Add wind speed ranges and names',
	      items: {
	        type: 'object',
	        properties: {
	          type: {
	            type: 'string',
	            title: 'Wind speed type',
	            default: 'Light air'
	          },
	          min: {
	            type: 'number',
              description: 'Range minimum for wind speed value',
	            title: 'Wind speed min (knots)',
              default: 0
	          },
	          max: {
	            type: 'number',
              description: 'Range maximum for wind speed value',
	            title: 'Wind speed max (knots)',
              default: 4
	          }
          }
        }
      },

	    windAnglePath: {
	      type: 'string',
	      title: 'Numeric source for wind angle information',
	      default: 'environment.wind.angleTrueWater'
	    },
      windAngle: {
	      type: 'array',
	      title: 'Add wind angle ranges and names',
	      items: {
	        type: 'object',
	        properties: {
	          type: {
	            type: 'string',
	            title: 'Wind angle name',
	            default: 'Upwind'
	          },
	          min: {
	            type: 'number',
              description: 'Range minimum for wind angle value',
	            title: 'Angle min (degrees)',
              default: 35
	          },
	          max: {
	            type: 'number',
              description: 'Range maximum for wind angle value. 180 is the max.',
	            title: 'Angle max (degrees)',
              default: 60
	          }
          }
        }
      },

    }
  } 

  plugin.schema = function() {
    return schema
  }

    plugin.start = function(options, restartPlugin) {
      app.debug('starting plugin')
      app.debug('Options: %j', Object.entries(options.sails));

      const sailconfigFile = path.join(app.getDataDirPath(), 'config.json')
      var currentCondition = {}
      var averageWave = []
      var averageWindSpeed = []
      var averageWindAngle = []

      let localSubscription = {
        context: '*', // Get data for all contexts
        subscribe: [
          {
            path: options.windSpeedPath, // Get wind speed
            period: 500 // ms
          },
          {
            path: options.windAnglePath, // Get wind angle 
            period: 500 // ms
          },
          {
            path: options.wavePath, // Get heel and trim
            period: 500 // ms
          }
        ]
      };
    
      plugin.registerWithRouter = function(router) {
	      // Will appear here; plugins/signalk-trim-plugin/
	      app.debug("registerWithRouter")
	      router.get("/schema", (req, res) => {
	        res.contentType("application/json")
	        res.send(JSON.stringify(schema))
	      })
	      router.get("/options", (req, res) => {
	        res.contentType("application/json")
          var freshOptions = app.readPluginOptions();
	        res.send(JSON.stringify(freshOptions))
	      })
	      router.post("/saveOptions", (req, res) => {
	        res.contentType("application/json")
          writeOptions(req.body);
          res.sendStatus(200);
	      })
	      router.get("/readConfig", (req, res) => {
	        res.contentType("application/json")
	        res.send(readConfig())
	      })
	      router.post("/saveConfig", (req, res) => {
	        res.contentType("application/json")
          writeConfig(req.body);
          res.sendStatus(200);
	      })
	    }

      app.subscriptionmanager.subscribe(
        localSubscription,
        unsubscribes,
        subscriptionError => {
          app.error('Error:' + subscriptionError);
        },
        delta => {
          delta.updates.forEach(u => {
            handleUpdate(u.values)
          });
        }
      );

      function runningAverage (array, value) {
        // Only use positive numbers to deal with both radian averaging and pitch usefulness
        value = Math.abs(value)
        if (array.length >= 10) {
          array.shift()
        }
        array.push(value)
        let sum = 0
        for (let i = 0; i < array.length; i++) {
          sum += array[i]
        }
        var average = sum / array.length
        return average
      }

      function handleUpdate (data) {
        // Set wave, wind speed and wind angle conditions
        var path = data[0]['path']
        var value = data[0]['value']
        var condition = ''
        var type = ''
        switch (path) {
          case options.wavePath:
            condition = 'wave'
            if (typeof value.pitch != 'undefined') {
              value = value.pitch
            }
            value = runningAverage(averageWave, value)
            break
          case options.windSpeedPath:
            condition = 'windSpeed'
            value = runningAverage(averageWindSpeed, value)
            value = value * mpsToKnots
            break
          case options.windAnglePath:
            condition = 'windAngle'
            value = runningAverage(averageWindAngle, value)
            value = Math.abs(value * radToDeg)
            break
        }
        options[condition].forEach(function (conditionType) {
          if (value >= conditionType.min && value <= conditionType.max) {
            type = conditionType.type
          }
        });
        if (currentCondition[condition] != type) {
          currentCondition[condition] = type
          app.debug("Condition changed: %f %s: %s", value, condition, type)
          pushDelta(app, 'environment.sailtrim.'+ condition, type)
        }
      }

			function pushDelta(app, path, value) {
        // app.debug("sendDelta: " + path + ": " + JSON.stringify(value))
			  app.handleMessage(plugin.id, {
			    updates: [
			      {
			        values: [
			          {
			            path: path,
			            value: value
			          }
			        ]
			      }
			    ]
			  })
			  return
			}

			function sendDelta(message) {
        pushDelta(app,
          "resources.trim." + message.stationId + "." + message.msgtype + "." + message.msgtypenr,
          { 
            "epoch": message.epoch,
            "text": message.text
          })
			}

      function getRandomInt(max) {
        return Math.floor(Math.random() * max);
      }

      function writeConfig (sailconfig) {
        try {
          fs.writeFileSync(sailconfigFile, JSON.stringify(sailconfig));
          app.debug('Config file written');
        } catch (err) {
          console.error(err)
        }
      }

      function writeOptions (options) {
        try {
          app.debug('Plugin options to save: %s', JSON.stringify(options));
          app.savePluginOptions(options, () => {app.debug('Plugin options saved')});
        } catch (err) {
          console.error(err)
        }
      }

      function readConfig () {
        // Read the options to get up to date settings
        // Then map info from the stored config onto it
        // This should make adding/removing elements through the plugin config work well.

        var sailconfig = buildConfig(); // From options

        app.debug('Checking for config file (' + sailconfigFile + ')');
        if (fs.existsSync(sailconfigFile)) {
          app.debug('Found config file. Reading...');
          var storedsailconfig = JSON.parse(fs.readFileSync(sailconfigFile, 'utf8'));
        } else {
          app.debug('No config file found.');
        }
        
        // app.debug('readConfig storedsailconfig: %j', Object.keys(storedsailconfig));

        // Now loop over the sailconfig and apply values from storedsailconfig
        try {
        for (const [wave, waveObject] of Object.entries(sailconfig.conditions)) {
          for (const [windSpeed, windSpeedObject] of Object.entries(sailconfig.conditions[wave])) {
            for (const [windAngle, windAngleObject] of Object.entries(sailconfig.conditions[wave][windSpeed])) {
              for (const [sailName, sailObject] of Object.entries(sailconfig.conditions[wave][windSpeed][windAngle])) {
                for (const [partName, partObject] of Object.entries(sailconfig.conditions[wave][windSpeed][windAngle][sailName])) {
                  try {
                    // See if we can map a marker
                    var storedMarker = storedsailconfig.conditions[wave][windSpeed][windAngle][sailName][partName].marker
                    if (storedMarker == '-') {
                      //app.debug('Skipping storedMarker: %s', storedMarker);
                    } else {
                      app.debug('storedMarker: %s', storedMarker);
                      sailconfig.conditions[wave][windSpeed][windAngle][sailName][partName].marker = storedMarker;
                    }
                  } catch (error) {
                  }
                  try {
                    // See if we can map an advice
                    var storedAdvice = storedsailconfig.conditions[wave][windSpeed][windAngle][sailName][partName].advice
                    if (storedAdvice == '-') {
                      //app.debug('Skipping storedAdvice: %s', storedAdvice);
                    } else {
                      app.debug('storedAdvice: %s', storedAdvice);
                      sailconfig.conditions[wave][windSpeed][windAngle][sailName][partName].advice = storedAdvice;
                    }
                  } catch (error) {
                  }
                }
              }
            }
          }
        }
        } catch (e) {
          app.debug('Stored config seems broken.');
        }
        return sailconfig
      }

      function buildConfig () {
        var options = app.readPluginOptions();
        options = options.configuration;
        // Build sail and markers table
        var sailconfig = {}
        try {
        sailconfig = {options: options, markers: {}};
        var sails = {};
        for (const [key, sail] of Object.entries(options.sails)) {
          sails[sail.sail] = {};
          sailconfig.markers[sail.sail] = {};
          for (const [key, part] of Object.entries(sail.parts)) {
            sails[sail.sail][part.part] = {marker: '-'};
            sailconfig.markers[sail.sail][part.part] = {markers: '-,' + part.markers};
          }
        }

        // Build conditions table
        sailconfig.conditions = {};
        for (const [waveKey, waveObject] of Object.entries(options['wave'])) {
          var wave = waveObject['type'];
          var entry = {};
          entry[wave] = {};
          for (const [windSpeedKey, windSpeedObject] of Object.entries(options['windSpeed'])) {
            var windSpeed = windSpeedObject['type'];
            entry[wave][windSpeed] = {};
            for (const [windAngleKey, windAngleObject] of Object.entries(options['windAngle'])) {
              var windAngle = windAngleObject['type'];
              entry[wave][windSpeed][windAngle] = {};
              for (const [sailName, sailObject] of Object.entries(sails)) {
                entry[wave][windSpeed][windAngle][sailName] = {}
                for (const [partName, partObject] of Object.entries(sailObject)) {
                  entry[wave][windSpeed][windAngle][sailName][partName] = {marker: '-', advice: '-'}
                  sailconfig.conditions[wave] = entry[wave];
                }
              }
            }
          }
        }
        } catch (e) {
          app.debug('Options file seems broken.')
        }
        return sailconfig
      }

      writeConfig(readConfig());
    }


    plugin.stop = function() {
      app.debug("Stopping")
      unsubscribes.forEach(f => f())
      // keyPaths.length = keyPaths.length - 1

      // clearInterval(pushInterval)

      // app.signalk.removeListener("delta", handleDelta)
      app.debug("Stopped")
    }

  return plugin;
};
module.exports.app = "app"
module.exports.options = "options"

# Trim webapp
A webapp that helps to trim the boat by storing advice and marker info.
Inspired by the [Trimm Scheibe](https://cdn.compass24.de/media/image/2e/2b/b2/0207401_r1_FS13ix.jpg).

## Features
 - Auto detect conditions
 - Set your own markers per trim option
 - English and Dutch start configuration available [here](https://github.com/htool/signalk-trim-plugin/tree/main/public/configs).

## Running on B&G MFD
To see the webapp on your B&G Vulcan or Zeus you need to install the [signalk-mfd-plugin](https://www.npmjs.com/package/signalk-mfd-plugin) as well.
You'll need to setup an additional IP on your SignalK server for it to work as described in it's readme.

Configure the signalk-mfd-plugin like:
```
Source: Sail trim
IP address: 192.168.3.12
Feature name: Sail trim
Name: Sail trim
Menu text: Sail trim
WebApp tile image url: http://192.168.3.12:3000/signalk-trim-plugin/trim.png
WebApp url: http://192.168.3.12:3000/signalk-trim-plugin/
```
Where 192.168.3.12 is the IP you've added.

## Screenshot
![Screenshot of Vulcan 12"](https://raw.githubusercontent.com/htool/signalk-trim-plugin/main/images/screenshot-vulcan.png)

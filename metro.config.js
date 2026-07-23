const { getDefaultConfig } = require('expo/metro-config');

require('dotenv').config();

const config = getDefaultConfig(__dirname);

module.exports = config;

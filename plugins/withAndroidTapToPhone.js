const {
  AndroidConfig,
  withDangerousMod,
  withAndroidManifest,
  withGradleProperties,
  withProjectBuildGradle,
} = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const permissions = [
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.BLUETOOTH_CONNECT',
  'android.permission.BLUETOOTH_SCAN',
];

const withAndroidTapToPhone = (config, props = {}) => {
  const localMavenRepo = props.localMavenRepo || process.env.CAPYSHOP_SDK_LOCAL_MAVEN_REPO;

  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) return config;

      let contents = fs.readFileSync(podfilePath, 'utf8');
      const podLine = "  pod 'RainforestTapSdk', :path => '../modules/rainforestpay-tap-sdk/ios'";

      if (!contents.includes(podLine)) {
        contents = contents.replace(/(target '.*' do\n\s*use_expo_modules!\n)/, `$1${podLine}\n`);
        fs.writeFileSync(podfilePath, contents);
      }

      return config;
    },
  ]);

  config = withGradleProperties(config, (config) => {
    config.modResults = setGradleProperty(config.modResults, 'android.minSdkVersion', '31');
    return config;
  });

  config = withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('withAndroidTapToPhone expected android/build.gradle to be Groovy');
    }

    config.modResults.contents = ensureMavenRepositories(config.modResults.contents, localMavenRepo);
    return config;
  });

  config = withAndroidManifest(config, (config) => {
    for (const permission of permissions) {
      const exists = config.modResults.manifest['uses-permission']?.some(
        (p) => p.$['android:name'] === permission
      );
      if (!exists) {
        AndroidConfig.Permissions.addPermission(config.modResults, permission);
      }
    }
    return config;
  });

  return config;
};

function ensureMavenRepositories(src, localMavenRepo) {
  if (src.includes('https://gitlab.com/api/v4/projects/77749278/packages/maven')) return src;

  const localRepoEntry = localMavenRepo
    ? `maven { url "file://${localMavenRepo.replace(/\/+$/, '')}" }`
    : `if (System.getenv('CAPYSHOP_SDK_LOCAL_MAVEN_REPO')) {
      maven { url "file://\${System.getenv('CAPYSHOP_SDK_LOCAL_MAVEN_REPO').replaceAll('/+\\$', '')}" }
    }`;

  // A function replacement, so `$` sequences in the Groovy below are not read as replace patterns.
  return src.replace(
    /allprojects\s*\{\s*repositories\s*\{/,
    () => `allprojects {
  repositories {
    maven { url 'https://gitlab.com/api/v4/projects/77749278/packages/maven' }
    maven { url 'https://gitlab.com/api/v4/projects/77784047/packages/maven' }
    ${localRepoEntry}`
  );
}

function setGradleProperty(properties, key, value) {
  const existing = properties.find((property) => property.type === 'property' && property.key === key);
  if (existing) {
    existing.value = value;
    return properties;
  }

  return [...properties, { type: 'property', key, value }];
}

module.exports = withAndroidTapToPhone;

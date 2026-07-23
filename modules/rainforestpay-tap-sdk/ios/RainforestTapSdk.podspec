require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'RainforestTapSdk'
  s.version        = package['version']
  s.summary        = 'Expo module bridge for Rainforest Tap to Phone.'
  s.description    = 'Expo module bridge for Rainforest Tap to Phone.'
  s.license        = 'MIT'
  s.author         = 'Rainforest'
  s.homepage       = 'https://rainforestpay.com'
  s.platforms      = { :ios => '17.4' }
  s.swift_version  = '5.9'
  s.source         = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'ProximityReader'
  s.vendored_frameworks = 'RainforestSDK.xcframework', 'CloudCommerce.xcframework'
  s.source_files = 'src/**/*.{h,m,mm,swift,hpp,cpp}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end

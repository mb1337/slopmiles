require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name = 'SlopMilesHealthKitBridge'
  s.version = package['version']
  s.summary = 'Local Expo module for SlopMiles HealthKit background sync.'
  s.description = 'Registers HealthKit background delivery, stores anchored workout sync state, and exposes it to React Native.'
  s.license = 'MIT'
  s.author = 'SlopMiles'
  s.homepage = 'https://example.com/slopmiles'
  s.platforms = {
    :ios => '15.1'
  }
  s.swift_version = '5.9'
  s.source = { git: 'https://example.com/slopmiles.git', tag: s.version.to_s }
  s.static_framework = true
  s.frameworks = 'HealthKit'

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,swift}'
end

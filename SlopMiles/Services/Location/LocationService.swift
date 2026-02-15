import CoreLocation
import os

private let logger = Logger(subsystem: "com.slopmiles", category: "location")

@Observable
@MainActor
final class LocationService {
    var authorizationStatus: CLAuthorizationStatus = .notDetermined

    private let manager = CLLocationManager()
    private let delegate = LocationDelegate()

    init() {
        manager.delegate = delegate
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
        authorizationStatus = manager.authorizationStatus
        delegate.onAuthorizationChange = { [weak self] status in
            Task { @MainActor in
                self?.authorizationStatus = status
            }
        }
    }

    var isAuthorized: Bool {
        authorizationStatus == .authorizedWhenInUse || authorizationStatus == .authorizedAlways
    }

    func requestLocationPermission() async {
        guard authorizationStatus == .notDetermined else { return }
        manager.requestWhenInUseAuthorization()
        await delegate.waitForPermission()
        authorizationStatus = manager.authorizationStatus
    }

    func requestCurrentLocation() async -> CLLocation? {
        guard isAuthorized else { return nil }
        manager.requestLocation()
        return await delegate.waitForLocation()
    }

    func updateProfileLocation(_ profile: UserProfile) async {
        guard let location = await requestCurrentLocation() else { return }
        profile.homeLatitude = location.coordinate.latitude
        profile.homeLongitude = location.coordinate.longitude
        logger.info("Updated profile location: \(location.coordinate.latitude), \(location.coordinate.longitude)")
    }
}

private final class LocationDelegate: NSObject, CLLocationManagerDelegate, @unchecked Sendable {
    var onAuthorizationChange: ((CLAuthorizationStatus) -> Void)?

    private var permissionContinuation: CheckedContinuation<Void, Never>?
    private var locationContinuation: CheckedContinuation<CLLocation?, Never>?

    func waitForPermission() async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            permissionContinuation = continuation
        }
    }

    func waitForLocation() async -> CLLocation? {
        await withCheckedContinuation { (continuation: CheckedContinuation<CLLocation?, Never>) in
            locationContinuation = continuation
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        onAuthorizationChange?(manager.authorizationStatus)
        if manager.authorizationStatus != .notDetermined {
            permissionContinuation?.resume()
            permissionContinuation = nil
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        locationContinuation?.resume(returning: locations.first)
        locationContinuation = nil
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        logger.error("Location error: \(error.localizedDescription)")
        locationContinuation?.resume(returning: nil)
        locationContinuation = nil
    }
}

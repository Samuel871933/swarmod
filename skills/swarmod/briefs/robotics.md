# Robotics checklist — for every agent that writes robot, embedded or control code

Confirm each item before STATUS: done. Never cut calibration, limits or safety code to simplify.
1. SI units and explicit frames (ROS REP 103: x forward, y left, z up, metres, radians); every transform names its parent and child frame.
2. Time: one clock source; sim time vs wall time handled; every sensor message timestamped; stale data (older than a stated timeout) rejected.
3. Safety first: the e-stop path is untouched; velocity, acceleration, torque and joint limits clamped in code; a command watchdog stops the robot when commands stop.
4. Control loop: its rate is stated and measured; no blocking I/O, allocation or log floods inside the loop.
5. Calibration values come from config, never hard-coded guesses; keep the existing calibration steps.
6. Messaging: QoS, message types and rates match between publisher and subscriber; no silent drops.
7. Test in simulation or with motors disabled first, and say which. Real-hardware runs need the user.
8. Sensor input is noisy and can be missing: filter and bound it; handle NaN, inf and dropouts.
9. Report what was tested in sim vs on hardware, and every limit value used.

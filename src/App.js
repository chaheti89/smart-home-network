import { __app_id, __firebase_config, __initial_auth_token } from './firebaseConfig';
import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getDatabase, ref, onValue } from 'firebase/database'; // Updated imports for Realtime Database

// Main App component
const App = () => {
  const [activeSection, setActiveSection] = useState('home');
  const [selectedTopology, setSelectedTopology] = useState('star');
  const canvasRef = useRef(null);
  const animationFrameId = useRef(null); // To store animation frame ID for cleanup

  // Firebase states
  const [db, setDb] = useState(null); // This will now be Realtime Database instance
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [liveNetworkData, setLiveNetworkData] = useState({
    signalStrength: 'N/A',
    latency: 'N/A',
    deliveryRate: 'N/A',
    lastUpdated: 'N/A',
  });
  const [firebaseError, setFirebaseError] = useState(null);

  // --- Firebase Initialization and Authentication ---
  useEffect(() => {
    try {
      // Access global variables for Firebase config and app ID
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
      const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

      if (!firebaseConfig || Object.keys(firebaseConfig).length === 0) {
        console.error("Firebase config is missing or empty. Please ensure __firebase_config is set.");
        setFirebaseError("Firebase is not configured. Live data will not be available.");
        return;
      }

      const app = initializeApp(firebaseConfig);
      const realtimeDb = getDatabase(app); // Get Realtime Database instance
      const firebaseAuth = getAuth(app);

      setDb(realtimeDb); // Set Realtime Database instance
      setAuth(firebaseAuth);

      const unsubscribeAuth = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          setUserId(user.uid);
          console.log("Firebase authenticated as:", user.uid);
        } else {
          // Sign in anonymously if no initial token or user is not authenticated
          try {
            if (initialAuthToken) {
              await signInWithCustomToken(firebaseAuth, initialAuthToken);
              console.log("Signed in with custom token.");
            } else {
              await signInAnonymously(firebaseAuth);
              console.log("Signed in anonymously.");
            }
          } catch (error) {
            console.error("Firebase authentication error:", error);
            setFirebaseError(`Authentication failed: ${error.message}`);
          }
        }
      });

      return () => unsubscribeAuth(); // Cleanup auth listener
    } catch (error) {
      console.error("Error initializing Firebase:", error);
      setFirebaseError(`Firebase initialization error: ${error.message}`);
    }
  }, []); // Run once on component mount

  // --- Firebase Realtime Database Listener ---
  useEffect(() => {
    if (!db || !userId) {
      console.log("Waiting for Firebase DB and userId to be available for Realtime Database listener.");
      return;
    }

    // Define the path for private user data in Realtime Database
    // Using a simpler path for Realtime Database as it doesn't have the same collection/document structure as Firestore
    const networkDataRef = ref(db, `users/${userId}/network_data/current_data`);
    console.log("Setting up Realtime Database listener for:", `users/${userId}/network_data/current_data`);
    console.log("Current User ID for Realtime Database path:", userId); // Log userId for user to copy

    const unsubscribeRealtimeDb = onValue(networkDataRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val(); // Get data value for Realtime Database
        setLiveNetworkData({
          signalStrength: data.signalStrength || 'N/A',
          latency: data.latency || 'N/A',
          deliveryRate: data.deliveryRate || 'N/A',
          lastUpdated: data.timestamp ? new Date(data.timestamp).toLocaleString() : new Date().toLocaleString(),
        });
        console.log("Live network data updated:", data);
      } else {
        console.log("No live network data found. Please add data to Realtime Database at:", `users/${userId}/network_data/current_data`);
        setLiveNetworkData({
          signalStrength: 'N/A',
          latency: 'N/A',
          deliveryRate: 'N/A',
          lastUpdated: 'N/A (No data yet)',
        });
      }
    }, (error) => {
      console.error("Error fetching live network data from Realtime Database:", error);
      // Update error message to guide the user on setting up security rules
      setFirebaseError(
        `Failed to fetch live data due to permission issues. ` +
        `Please ensure your Firebase Realtime Database rules allow read access for authenticated users at ` +
        `'users/${userId}/network_data/current_data'. ` +
        `You can set rules like: {"rules": {"users": {"$uid": {".read": "auth.uid == $uid", ".write": "auth.uid == $uid"}}}}`
      );
    });

    return () => unsubscribeRealtimeDb(); // Cleanup Realtime Database listener
  }, [db, userId]); // Re-run when db or userId changes

  // Function to scroll to a section smoothly
  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setActiveSection(id);
    }
  };

  // --- Canvas Drawing Logic with Animation ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const deviceRadius = 15;
    const deviceColor = '#3B82F6';
    const connectionColor = '#60A5FA';
    const textColor = '#1F2937';
    const packetColor = '#FFD700'; // Gold for packets
    const packetRadius = 5;
    const packetSpeed = 1.5; // Pixels per frame

    let packets = [];
    let lastTime = 0;
    const packetInterval = 1000; // Milliseconds between new packets

    // Drawing helper functions
    const drawDevice = (ctx, x, y, radius, color, label) => {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = textColor;
      ctx.fillText(label, x, y + radius + 10);
    };

    const drawConnection = (ctx, x1, y1, x2, y2, color) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    };

    // Packet drawing and movement
    const createPacket = (path) => {
      if (path.length < 2) return null;
      return {
        x: path[0].x,
        y: path[0].y,
        path: path,
        currentSegment: 0,
        distanceTraveled: 0,
      };
    };

    const updatePackets = (deltaTime) => {
      packets = packets.filter(packet => {
        if (packet.currentSegment >= packet.path.length - 1) {
          return false; // Packet reached end of path
        }

        const startNode = packet.path[packet.currentSegment];
        const endNode = packet.path[packet.currentSegment + 1];

        const segmentLength = Math.sqrt(
          Math.pow(endNode.x - startNode.x, 2) + Math.pow(endNode.y - startNode.y, 2)
        );

        packet.distanceTraveled += packetSpeed * (deltaTime / 16); // Normalize speed by frame time

        if (packet.distanceTraveled >= segmentLength) {
          packet.currentSegment++;
          packet.distanceTraveled = 0; // Reset for next segment
          if (packet.currentSegment >= packet.path.length - 1) {
            return false; // Packet completed its journey
          }
          // Set position to the start of the next segment
          packet.x = packet.path[packet.currentSegment].x;
          packet.y = packet.path[packet.currentSegment].y;
        } else {
          const ratio = packet.distanceTraveled / segmentLength;
          packet.x = startNode.x + (endNode.x - startNode.x) * ratio;
          packet.y = startNode.y + (endNode.y - startNode.y) * ratio;
        }
        return true;
      });
    };

    const drawPacket = (ctx, packet) => {
      ctx.beginPath();
      ctx.arc(packet.x, packet.y, packetRadius, 0, Math.PI * 2);
      ctx.fillStyle = packetColor;
      ctx.fill();
    };

    // Topology specific drawing functions (now also return paths for packets)
    const drawStarTopology = (ctx, width, height, r, dColor, cColor, tColor) => {
      const centerX = width / 2;
      const centerY = height / 2;
      const hub = { x: centerX, y: centerY, label: 'Router/Hub' };
      const numDevices = 5;
      const spreadRadius = Math.min(width, height) * 0.35;
      const devices = [];

      drawDevice(ctx, hub.x, hub.y, r + 5, '#EF4444', hub.label);

      for (let i = 0; i < numDevices; i++) {
        const angle = (i / numDevices) * Math.PI * 2;
        const deviceX = centerX + spreadRadius * Math.cos(angle);
        const deviceY = centerY + spreadRadius * Math.sin(angle);
        const device = { x: deviceX, y: deviceY, label: `Device ${i + 1}` };
        devices.push(device);
        drawDevice(ctx, device.x, device.y, r, dColor, device.label);
        drawConnection(ctx, hub.x, hub.y, device.x, device.y, cColor);
      }

      // Return paths for packets (hub to device, and device to hub)
      const paths = [];
      devices.forEach(device => {
        paths.push([hub, device]);
        paths.push([device, hub]);
      });
      return paths;
    };

    const drawMeshTopology = (ctx, width, height, r, dColor, cColor, tColor) => {
      const numDevices = 5;
      const devices = [];
      const padding = r * 2;

      for (let i = 0; i < numDevices; i++) {
        let x, y;
        let collision;
        do {
          collision = false;
          x = padding + Math.random() * (width - 2 * padding);
          y = padding + Math.random() * (height - 2 * padding);
          for (const existingDevice of devices) {
            const dist = Math.sqrt(Math.pow(x - existingDevice.x, 2) + Math.pow(y - existingDevice.y, 2));
            if (dist < r * 4) {
              collision = true;
              break;
            }
          }
        } while (collision);
        devices.push({ x, y, label: `Device ${i + 1}` });
      }

      const paths = [];
      for (let i = 0; i < devices.length; i++) {
        for (let j = i + 1; j < devices.length; j++) {
          drawConnection(ctx, devices[i].x, devices[i].y, devices[j].x, devices[j].y, cColor);
          paths.push([devices[i], devices[j]]);
          paths.push([devices[j], devices[i]]);
        }
      }

      devices.forEach(device => drawDevice(ctx, device.x, device.y, r, dColor, device.label));
      return paths;
    };

    const drawBusTopology = (ctx, width, height, r, dColor, cColor, tColor) => {
      const busY = height / 2;
      const numDevices = 5;
      const startX = width * 0.1;
      const endX = width * 0.9;
      const busLength = endX - startX;
      const deviceSpacing = busLength / (numDevices - 1);

      ctx.beginPath();
      ctx.moveTo(startX, busY);
      ctx.lineTo(endX, busY);
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = textColor;
      ctx.fillText('Main Bus', width / 2, busY - 20);

      const devices = [];
      for (let i = 0; i < numDevices; i++) {
        const deviceX = startX + i * deviceSpacing;
        const deviceY = busY + r * 2;
        const device = { x: deviceX, y: deviceY, label: `Device ${i + 1}` };
        devices.push(device);
        drawDevice(ctx, device.x, device.y, r, dColor, device.label);
        drawConnection(ctx, device.x, device.y - r, device.x, busY, cColor);
      }

      // For bus, packets travel along the bus line
      const busNodes = devices.map(d => ({ x: d.x, y: busY }));
      const paths = [];
      for (let i = 0; i < busNodes.length - 1; i++) {
        paths.push([busNodes[i], busNodes[i+1]]);
        paths.push([busNodes[i+1], busNodes[i]]);
      }
      return paths;
    };

    const drawTreeTopology = (ctx, width, height, r, dColor, cColor, tColor) => {
      const paths = [];

      const root = { x: width / 2, y: height * 0.15, label: 'Root Hub' };
      drawDevice(ctx, root.x, root.y, r, '#EF4444', root.label);

      const level1Y = height * 0.45;
      const level1A = { x: width * 0.25, y: level1Y, label: 'Sub-Hub A' };
      const level1B = { x: width * 0.75, y: level1Y, label: 'Sub-Hub B' };

      drawDevice(ctx, level1A.x, level1A.y, r, '#F59E0B', level1A.label);
      drawConnection(ctx, root.x, root.y, level1A.x, level1A.y, cColor);
      paths.push([root, level1A]);
      paths.push([level1A, root]);

      drawDevice(ctx, level1B.x, level1B.y, r, '#F59E0B', level1B.label);
      drawConnection(ctx, root.x, root.y, level1B.x, level1B.y, cColor);
      paths.push([root, level1B]);
      paths.push([level1B, root]);

      const level2Y = height * 0.75;
      const devices = [
        { x: width * 0.15, y: level2Y, label: 'Device 1' },
        { x: width * 0.35, y: level2Y, label: 'Device 2' },
        { x: width * 0.65, y: level2Y, label: 'Device 3' },
        { x: width * 0.85, y: level2Y, label: 'Device 4' },
      ];

      drawDevice(ctx, devices[0].x, devices[0].y, r, dColor, devices[0].label);
      drawConnection(ctx, level1A.x, level1A.y, devices[0].x, devices[0].y, cColor);
      paths.push([level1A, devices[0]]);
      paths.push([devices[0], level1A]);

      drawDevice(ctx, devices[1].x, devices[1].y, r, dColor, devices[1].label);
      drawConnection(ctx, level1A.x, level1A.y, devices[1].x, devices[1].y, cColor);
      paths.push([level1A, devices[1]]);
      paths.push([devices[1], level1A]);

      drawDevice(ctx, devices[2].x, devices[2].y, r, dColor, devices[2].label);
      drawConnection(ctx, level1B.x, level1B.y, devices[2].x, devices[2].y, cColor);
      paths.push([level1B, devices[2]]);
      paths.push([devices[2], level1B]);

      drawDevice(ctx, devices[3].x, devices[3].y, r, dColor, devices[3].label);
      drawConnection(ctx, level1B.x, level1B.y, devices[3].x, devices[3].y, cColor);
      paths.push([level1B, devices[3]]);
      paths.push([devices[3], level1B]);

      return paths;
    };

    const drawHybridTopology = (ctx, width, height, r, dColor, cColor, tColor) => {
      const paths = [];

      // Star part (left side)
      const starHub = { x: width * 0.25, y: height / 2, label: 'Star Hub' };
      drawDevice(ctx, starHub.x, starHub.y, r + 5, '#EF4444', starHub.label);
      const starDevices = [];
      const starSpread = width * 0.1;
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2;
        const devX = starHub.x + starSpread * Math.cos(angle);
        const devY = starHub.y + starSpread * Math.sin(angle);
        const device = { x: devX, y: devY, label: `S-Dev ${i + 1}` };
        starDevices.push(device);
        drawDevice(ctx, device.x, device.y, r, dColor, device.label);
        drawConnection(ctx, starHub.x, starHub.y, device.x, device.y, cColor);
        paths.push([starHub, device]);
        paths.push([device, starHub]);
      }

      // Mesh part (right side)
      const meshDevices = [];
      const meshPaddingX = width * 0.6;
      const meshPaddingY = height * 0.1;
      const meshWidth = width * 0.3;
      const meshHeight = height * 0.8;

      for (let i = 0; i < 3; i++) {
        let x, y;
        let collision;
        do {
          collision = false;
          x = meshPaddingX + Math.random() * meshWidth;
          y = meshPaddingY + Math.random() * meshHeight;
          for (const existingDevice of meshDevices) {
            const dist = Math.sqrt(Math.pow(x - existingDevice.x, 2) + Math.pow(y - existingDevice.y, 2));
            if (dist < r * 4) {
              collision = true;
              break;
            }
          }
        } while (collision);
        const device = { x, y, label: `M-Dev ${i + 1}` };
        meshDevices.push(device);
      }

      for (let i = 0; i < meshDevices.length; i++) {
        for (let j = i + 1; j < meshDevices.length; j++) {
          drawConnection(ctx, meshDevices[i].x, meshDevices[i].y, meshDevices[j].x, meshDevices[j].y, cColor);
          paths.push([meshDevices[i], meshDevices[j]]);
          paths.push([meshDevices[j], meshDevices[i]]);
        }
      }
      meshDevices.forEach(device => drawDevice(ctx, device.x, device.y, r, '#10B981', device.label));

      // Connect Star and Mesh (e.g., Star Hub to one Mesh Device)
      if (starDevices.length > 0 && meshDevices.length > 0) {
        drawConnection(ctx, starHub.x, starHub.y, meshDevices[0].x, meshDevices[0].y, '#DC2626');
        paths.push([starHub, meshDevices[0]]);
        paths.push([meshDevices[0], starHub]);
        ctx.fillStyle = textColor;
        ctx.fillText('Bridge Link', (starHub.x + meshDevices[0].x) / 2, (starHub.y + meshDevices[0].y) / 2 - 10);
      }
      return paths;
    };

    // Main draw and animation loop function
    const animate = (currentTime) => {
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;

      ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas

      let currentPaths = [];
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Draw the selected topology and get its paths
      switch (selectedTopology) {
        case 'star':
          currentPaths = drawStarTopology(ctx, canvas.width, canvas.height, deviceRadius, deviceColor, connectionColor, textColor);
          break;
        case 'mesh':
          currentPaths = drawMeshTopology(ctx, canvas.width, canvas.height, deviceRadius, deviceColor, connectionColor, textColor);
          break;
        case 'bus':
          currentPaths = drawBusTopology(ctx, canvas.width, canvas.height, deviceRadius, deviceColor, connectionColor, textColor);
          break;
        case 'tree':
          currentPaths = drawTreeTopology(ctx, canvas.width, canvas.height, deviceRadius, deviceColor, connectionColor, textColor);
          break;
        case 'hybrid':
          currentPaths = drawHybridTopology(ctx, canvas.width, canvas.height, deviceRadius, deviceColor, connectionColor, textColor);
          break;
        default:
          currentPaths = drawStarTopology(ctx, canvas.width, canvas.height, deviceRadius, deviceColor, connectionColor, textColor);
          break;
      }

      // Add new packets periodically
      if (currentTime - (packets.lastSpawnTime || 0) > packetInterval) {
        if (currentPaths.length > 0) {
          const randomPath = currentPaths[Math.floor(Math.random() * currentPaths.length)];
          const newPacket = createPacket(randomPath);
          if (newPacket) {
            packets.push(newPacket);
            packets.lastSpawnTime = currentTime;
          }
        }
      }

      updatePackets(deltaTime); // Update packet positions
      packets.forEach(packet => drawPacket(ctx, packet)); // Draw packets

      animationFrameId.current = requestAnimationFrame(animate); // Continue the loop
    };

    // Set canvas dimensions to be responsive
    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = Math.min(canvas.offsetWidth * 0.6, 400);
      // Redraw immediately after resize, then start animation
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      lastTime = performance.now(); // Reset lastTime for smooth animation start
      packets = []; // Clear packets on resize
      animate(lastTime); // Start animation loop
    };

    // Initial setup
    resizeCanvas(); // Set initial size and start animation
    window.addEventListener('resize', resizeCanvas);

    // Cleanup function
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [selectedTopology]); // Re-run effect when topology changes

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 font-sans text-gray-900">
      {/* Header and Navigation */}
      <header className="bg-blue-700 text-white p-4 shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">Smart Home Networks</h1>
          <nav>
            <ul className="flex space-x-4">
              <li>
                <button
                  onClick={() => scrollToSection('home')}
                  className={`py-2 px-3 rounded-md transition-colors duration-300 ${activeSection === 'home' ? 'bg-blue-600' : 'hover:bg-blue-600'}`}
                >
                  Home
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('topologies')}
                  className={`py-2 px-3 rounded-md transition-colors duration-300 ${activeSection === 'topologies' ? 'bg-blue-600' : 'hover:bg-blue-600'}`}
                >
                  Topologies
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('why-choose')}
                  className={`py-2 px-3 rounded-md transition-colors duration-300 ${activeSection === 'why-choose' ? 'bg-blue-600' : 'hover:bg-blue-600'}`}
                >
                  Why Choose?
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('simulation')}
                  className={`py-2 px-3 rounded-md transition-colors duration-300 ${activeSection === 'simulation' ? 'bg-blue-600' : 'hover:bg-blue-600'}`}
                >
                  Visualize
                </button>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section id="home" className="relative h-96 flex items-center justify-center text-white bg-cover bg-center"
        style={{ backgroundImage: "url('https://placehold.co/1200x400/3B82F6/FFFFFF?text=Smart+Home+Network')" }}>
        <div className="absolute inset-0 bg-black opacity-50"></div>
        <div className="z-10 text-center p-4">
          <h2 className="text-4xl md:text-5xl font-extrabold leading-tight mb-4">
            Design Your Perfect Smart Home Network
          </h2>
          <p className="text-lg md:text-xl max-w-2xl mx-auto">
            Explore different network topologies to optimize performance, reliability, and security for your connected home.
          </p>
          <button
            onClick={() => scrollToSection('topologies')}
            className="mt-8 bg-white text-blue-700 font-bold py-3 px-8 rounded-full shadow-lg hover:bg-gray-100 transform hover:scale-105 transition-all duration-300"
          >
            Learn More
          </button>
        </div>
      </section>

      {/* Topologies Section */}
      <section id="topologies" className="py-16 px-4 md:px-8 bg-white shadow-inner">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-800 mb-12">
            Understanding Network Topologies
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Star Topology Card */}
            <div className="bg-white p-6 rounded-lg shadow-xl border border-gray-200 hover:shadow-2xl transition-shadow duration-300">
              <div className="flex items-center justify-center mb-4 text-blue-500">
                {/* Star Icon */}
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-3 text-center">Star Topology</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                All devices connect to a central hub (router/switch). Simple to manage and troubleshoot, and device failures don't affect the whole network.
              </p>
              <h4 className="font-semibold text-gray-800 mb-2">Ideal For:</h4>
              <ul className="list-disc list-inside text-gray-600 text-sm">
                <li>Typical home networks</li>
                <li>Easy expansion</li>
                <li>Centralized control</li>
              </ul>
            </div>

            {/* Mesh Topology Card */}
            <div className="bg-white p-6 rounded-lg shadow-xl border border-gray-200 hover:shadow-2xl transition-shadow duration-300">
              <div className="flex items-center justify-center mb-4 text-green-500">
                {/* Mesh Icon */}
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-network"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 7h-4"/><path d="M7 14v-4"/><path d="M17 14v-4"/><path d="M10 17h4"/></svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-3 text-center">Mesh Topology</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                Devices connect to each other, forming a robust, self-healing network with multiple data paths. Excellent for large homes with many devices.
              </p>
              <h4 className="font-semibold text-gray-800 mb-2">Ideal For:</h4>
              <ul className="list-disc list-inside text-gray-600 text-sm">
                <li>Large homes with coverage issues</li>
                <li>High reliability needs</li>
                <li>Seamless roaming</li>
              </ul>
            </div>

            {/* Bus Topology Card */}
            <div className="bg-white p-6 rounded-lg shadow-xl border border-gray-200 hover:shadow-2xl transition-shadow duration-300">
              <div className="flex items-center justify-center mb-4 text-yellow-500">
                {/* Bus Icon (Custom SVG for a line with nodes) */}
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <circle cx="7" cy="12" r="3" fill="currentColor"/>
                  <circle cx="12" cy="12" r="3" fill="currentColor"/>
                  <circle cx="17" cy="12" r="3" fill="currentColor"/>
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-3 text-center">Bus Topology</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                All devices share a single communication line (bus). Simple and cost-effective for small networks, but a break in the bus affects the entire network.
              </p>
              <h4 className="font-semibold text-gray-800 mb-2">Ideal For:</h4>
              <ul className="list-disc list-inside text-gray-600 text-sm">
                <li>Small, simple networks</li>
                <li>Temporary setups</li>
                <li>Minimal cabling</li>
              </ul>
            </div>

            {/* Tree Topology Card */}
            <div className="bg-white p-6 rounded-lg shadow-xl border border-gray-200 hover:shadow-2xl transition-shadow duration-300">
              <div className="flex items-center justify-center mb-4 text-indigo-500">
                {/* Tree Icon (Custom SVG for a hierarchical structure) */}
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="6" y1="3" x2="6" y2="15"/>
                  <circle cx="18" cy="6" r="3"/>
                  <circle cx="6" cy="18" r="3"/>
                  <path d="M18 9c-1.83 2.17-4.17 3.83-6 5"/>
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-3 text-center">Tree Topology</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                A hierarchical structure where devices are connected in a tree-like fashion. Combines features of star and bus, offering scalability.
              </p>
              <h4 className="font-semibold text-gray-800 mb-2">Ideal For:</h4>
              <ul className="list-disc list-inside text-gray-600 text-sm">
                <li>Larger, segmented networks</li>
                <li>Scalability and expansion</li>
                <li>Departmental networks</li>
              </ul>
            </div>

            {/* Hybrid Topology Card */}
            <div className="bg-white p-6 rounded-lg shadow-xl border border-gray-200 hover:shadow-2xl transition-shadow duration-300">
              <div className="flex items-center justify-center mb-4 text-purple-500">
                {/* Hybrid Icon */}
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-git-fork"><path d="M12 18v-5l-4 4M12 18v-5l4 4M12 18v-5"/><circle cx="12" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/></svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-3 text-center">Hybrid Topology</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                Combines two or more different topologies (e.g., star and mesh) to leverage the strengths of each, creating a highly customized and efficient network.
              </p>
              <h4 className="font-semibold text-gray-800 mb-2">Ideal For:</h4>
              <ul className="list-disc list-inside text-gray-600 text-sm">
                <li>Complex smart home setups</li>
                <li>Optimizing specific zones</li>
                <li>Best of both worlds</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Section */}
      <section id="why-choose" className="py-16 px-4 md:px-8 bg-blue-600 text-white">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-8">
            Why Your Network Topology Matters
          </h2>
          <p className="text-lg md:text-xl leading-relaxed max-w-3xl mx-auto mb-12">
            The right network topology ensures seamless communication between your smart devices, leading to better performance, enhanced security, and a more reliable smart home experience.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 bg-blue-700 rounded-lg shadow-xl">
              <h3 className="text-2xl font-bold mb-3">Performance</h3>
              <p className="text-blue-100">
                Reduce latency and ensure quick response times for all your smart devices, from lighting to security cameras.
              </p>
            </div>
            <div className="p-6 bg-blue-700 rounded-lg shadow-xl">
              <h3 className="text-2xl font-bold mb-3">Reliability</h3>
              <p className="text-blue-100">
                Minimize downtime and ensure your smart home functions consistently, even if one device or connection fails.
              </p>
            </div>
            <div className="p-6 bg-blue-700 rounded-lg shadow-xl">
              <h3 className="text-2xl font-bold mb-3">Security</h3>
              <p className="text-blue-100">
                A well-planned topology can help isolate devices and enhance the overall security posture of your smart home network.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Simulation and Live Data Section */}
      <section id="simulation" className="py-16 px-4 md:px-8 bg-white shadow-inner">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-8">
            Visualize Topologies & Live Data
          </h2>
          <p className="text-gray-700 mb-8">
            Select a topology to see an animated visual representation. Live network parameters are fetched from Firebase.
          </p>

          {/* Live Network Data Display */}
          <div className="bg-blue-50 p-6 rounded-lg shadow-md border border-blue-200 mb-8 mx-auto max-w-md">
            <h3 className="text-xl font-bold text-blue-800 mb-4">Live Network Parameters</h3>
            {firebaseError ? (
              <p className="text-red-600 font-medium">{firebaseError}</p>
            ) : (
              <div className="text-left text-gray-700 space-y-2">
                <p><span className="font-semibold">User ID:</span> {userId || 'Authenticating...'}</p>
                <p><span className="font-semibold">Signal Strength:</span> {liveNetworkData.signalStrength}</p>
                <p><span className="font-semibold">Latency:</span> {liveNetworkData.latency}</p>
                <p><span className="font-semibold">Delivery Rate:</span> {liveNetworkData.deliveryRate}</p>
                <p className="text-sm text-gray-500">Last Updated: {liveNetworkData.lastUpdated}</p>
                <p className="text-xs text-gray-500 mt-2">
                  To update data, navigate to the `users/{userId}/network_data/current_data` path in your Firebase Realtime Database.
                  Example data structure: `{'{'} "signalStrength": "75%", "latency": "20ms", "deliveryRate": "99%", "timestamp": "2023-07-24T10:30:00Z" {'}'}`
                </p>
              </div>
            )}
          </div>

          {/* Topology Selector */}
          <div className="mb-8">
            <label htmlFor="topology-select" className="block text-lg font-medium text-gray-700 mb-2">
              Choose a Topology:
            </label>
            <select
              id="topology-select"
              value={selectedTopology}
              onChange={(e) => setSelectedTopology(e.target.value)}
              className="mt-1 block mx-auto w-full max-w-xs pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md shadow-sm"
            >
              <option value="star">Star</option>
              <option value="mesh">Mesh</option>
              <option value="bus">Bus</option>
              <option value="tree">Tree</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>

          {/* Canvas for Simulation */}
          <div className="bg-gray-100 border border-gray-300 rounded-lg shadow-lg overflow-hidden flex justify-center items-center">
            <canvas ref={canvasRef} className="w-full h-auto block"></canvas>
          </div>
          <p className="text-gray-600 text-sm mt-4">
            Note: This is a simplified visual representation for illustrative purposes.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-800 text-white p-6 text-center text-sm">
        <p>&copy; {new Date().getFullYear()} Smart Home Networks. All rights reserved.</p>
        <p className="mt-2">Designed with <span role="img" aria-label="heart">❤️</span> for a smarter home.</p>
      </footer>
    </div>
  );
};

export default App;

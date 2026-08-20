/**
 * WasteRoute AI — Comprehensive Project Report Generator
 * Generates a professional Word (.docx) document with full project documentation.
 * Run: node generate_report.mjs
 */

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType, PageBreak,
  Header, Footer, TabStopType, TabStopPosition,
} from 'docx';
import fs from 'fs';

// ── Colour constants ─────────────────────────────────────
const PRIMARY = '0288D1';
const DARK = '1E293B';
const GREEN = '22C55E';
const GRAY = '64748B';
const WHITE = 'FFFFFF';
const LIGHT_BG = 'F0F4F8';

// ── Font helpers ─────────────────────────────────────────
const heading = (text, level = HeadingLevel.HEADING_1) =>
  new Paragraph({ heading: level, spacing: { before: 300, after: 120 }, children: [new TextRun({ text, bold: true, font: 'Calibri', color: DARK })] });

const subHeading = (text) => heading(text, HeadingLevel.HEADING_2);
const subSubHeading = (text) => heading(text, HeadingLevel.HEADING_3);

const para = (text, opts = {}) =>
  new Paragraph({
    spacing: { after: 100 },
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    children: [new TextRun({ text, font: 'Calibri', size: 22, color: opts.color || '333333', bold: opts.bold, italics: opts.italics })],
  });

const bullet = (text) =>
  new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, font: 'Calibri', size: 22 })],
  });

const subBullet = (text) =>
  new Paragraph({
    bullet: { level: 1 },
    spacing: { after: 40 },
    children: [new TextRun({ text, font: 'Calibri', size: 21 })],
  });

const boldPara = (label, value) =>
  new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({ text: label, font: 'Calibri', size: 22, bold: true, color: DARK }),
      new TextRun({ text: value, font: 'Calibri', size: 22, color: '333333' }),
    ],
  });

const emptyPara = () => new Paragraph({ spacing: { after: 40 } });

// ── Table helpers ────────────────────────────────────────
const headerCell = (text) =>
  new TableCell({
    shading: { fill: DARK, type: ShadingType.SOLID, color: DARK },
    children: [new Paragraph({ children: [new TextRun({ text, font: 'Calibri', size: 20, bold: true, color: WHITE })] })],
  });

const cell = (text, fill) =>
  new TableCell({
    shading: fill ? { fill, type: ShadingType.SOLID, color: fill } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text: text || '—', font: 'Calibri', size: 20 })] })],
  });

const makeTable = (headers, rows) =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: headers.map(h => headerCell(h)) }),
      ...rows.map((r, i) =>
        new TableRow({ children: r.map(c => cell(c, i % 2 === 1 ? LIGHT_BG : undefined)) })
      ),
    ],
  });

// ── Page break ───────────────────────────────────────────
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

// ═══════════════════════════════════════════════════════════
// DOCUMENT SECTIONS
// ═══════════════════════════════════════════════════════════

const sections = [];

// ─────────────────────────────────────────────────────────
// COVER PAGE
// ─────────────────────────────────────────────────────────
sections.push(
  emptyPara(), emptyPara(), emptyPara(), emptyPara(), emptyPara(),
  emptyPara(), emptyPara(), emptyPara(),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: 'WASTEROUTE AI', font: 'Calibri', size: 56, bold: true, color: PRIMARY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: 'Intelligent Municipal Waste Collection Platform', font: 'Calibri', size: 28, color: GRAY, italics: true })] }),
  emptyPara(),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: 'Comprehensive Project Report', font: 'Calibri', size: 32, bold: true, color: DARK })] }),
  emptyPara(), emptyPara(),
  para('Modasa Municipal Corporation, Gujarat, India', { center: true, color: GRAY }),
  para('Smart City Initiative 2026', { center: true, color: GRAY, italics: true }),
  emptyPara(), emptyPara(), emptyPara(), emptyPara(),
  para(`Report Generated: ${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}`, { center: true, color: GRAY }),
  para('Version: 1.0.0', { center: true, color: GRAY }),
  pageBreak(),
);

// ─────────────────────────────────────────────────────────
// TABLE OF CONTENTS
// ─────────────────────────────────────────────────────────
sections.push(
  heading('Table of Contents'),
  emptyPara(),
  para('1. Executive Summary'),
  para('2. Project Overview'),
  para('3. Technology Stack'),
  para('4. System Architecture'),
  para('5. Database Design'),
  para('6. Backend API Design'),
  para('7. Frontend Architecture'),
  para('8. Core Algorithms'),
  para('9. Key Features'),
  para('10. Authentication & Authorization'),
  para('11. Real-Time Synchronization'),
  para('12. PDF Report Generation'),
  para('13. Map Integration'),
  para('14. Problems Faced & Solutions'),
  para('15. Testing & Validation'),
  para('16. Deployment Guide'),
  para('17. Future Enhancements'),
  para('18. Conclusion'),
  pageBreak(),
);

// ─────────────────────────────────────────────────────────
// 1. EXECUTIVE SUMMARY
// ─────────────────────────────────────────────────────────
sections.push(
  heading('1. Executive Summary'),
  para('WasteRoute AI is an intelligent municipal waste collection and route management platform built for Modasa Municipal Corporation, Gujarat. The system uses AI-driven optimization, real-time monitoring, and simulation-based planning to improve waste collection efficiency across 42 zones using a fleet of up to 27 trucks.'),
  emptyPara(),
  para('The platform combines a Node.js/Express backend with MongoDB Atlas cloud database and a React.js frontend featuring interactive Leaflet maps, to deliver a complete operational control centre for municipal waste management. Key capabilities include:'),
  bullet('AI-powered chat assistant using Groq LLM (LLaMA 3) for natural language operational queries'),
  bullet('Greedy route optimization with priority-weighted nearest-neighbour algorithm'),
  bullet('Smart bin placement simulation across 3 deployment epochs'),
  bullet('Fleet size optimization with zone redistribution'),
  bullet('Real-time route synchronization across all system views'),
  bullet('Role-based login system (Admin / Driver)'),
  bullet('PDF route document generation with schematic maps'),
  bullet('OSRM-based real road routing for map visualization'),
  pageBreak(),
);

// ─────────────────────────────────────────────────────────
// 2. PROJECT OVERVIEW
// ─────────────────────────────────────────────────────────
sections.push(
  heading('2. Project Overview'),
  subHeading('2.1 Problem Statement'),
  para('Municipal waste collection in small to mid-sized Indian cities like Modasa faces several challenges: inefficient routing leading to increased fuel consumption, lack of real-time visibility into collection operations, no data-driven decision making for bin placement, and manual route planning that cannot adapt to dynamic conditions like road blockages or area prioritization.'),
  emptyPara(),
  subHeading('2.2 Objectives'),
  bullet('Develop an intelligent route optimization system that minimizes travel distance while prioritizing high-risk zones'),
  bullet('Create a simulation framework for smart bin deployment to reduce collection time'),
  bullet('Build a real-time operational dashboard for fleet monitoring'),
  bullet('Implement an AI assistant for natural language operational queries'),
  bullet('Provide driver-facing interfaces for route acknowledgement and field reporting'),
  bullet('Generate downloadable PDF route documents for offline driver use'),
  emptyPara(),
  subHeading('2.3 Scope'),
  para('The system covers the complete waste collection lifecycle for Modasa city: zone management (42 zones of 6 types), truck fleet management (27 trucks), route planning and optimization, smart bin simulation, driver operations, flag/incident reporting, and administrative oversight through an AI-powered helper panel.'),
  pageBreak(),
);

// ─────────────────────────────────────────────────────────
// 3. TECHNOLOGY STACK
// ─────────────────────────────────────────────────────────
sections.push(
  heading('3. Technology Stack'),
  subHeading('3.1 Backend'),
  makeTable(
    ['Technology', 'Version', 'Purpose'],
    [
      ['Node.js', 'v18+', 'Server runtime environment'],
      ['Express.js', '5.2.1', 'REST API framework'],
      ['MongoDB Atlas', 'Cloud', 'NoSQL database (cloud-hosted)'],
      ['Mongoose', '9.3.3', 'MongoDB ODM for schema validation'],
      ['Groq SDK', '1.1.2', 'LLM API client (LLaMA 3 70B)'],
      ['dotenv', '17.4.0', 'Environment variable management'],
      ['cors', '2.8.6', 'Cross-origin resource sharing'],
      ['nodemon', '3.1.14', 'Development auto-restart (dev)'],
    ]
  ),
  emptyPara(),
  subHeading('3.2 Frontend'),
  makeTable(
    ['Technology', 'Version', 'Purpose'],
    [
      ['React', '18.2.0', 'UI component library'],
      ['Vite', '5.2.0', 'Build tool and dev server'],
      ['React Router DOM', '7.13.2', 'Client-side routing'],
      ['Leaflet + React-Leaflet', '1.9.4 / 4.2.1', 'Interactive map rendering'],
      ['Axios', '1.14.0', 'HTTP client for API calls'],
      ['Lucide React', '1.7.0', 'Icon library (700+ icons)'],
      ['jsPDF + AutoTable', '4.2.1 / 5.0.7', 'PDF document generation'],
      ['JSZip', '3.10.1', 'ZIP archive creation for batch PDFs'],
      ['React Hot Toast', '2.6.0', 'Toast notification system'],
    ]
  ),
  emptyPara(),
  subHeading('3.3 External APIs'),
  makeTable(
    ['API', 'Provider', 'Purpose'],
    [
      ['OSRM (Open Source Routing Machine)', 'router.project-osrm.org', 'Real road routing polylines for map display'],
      ['Groq Cloud LLM', 'Groq Inc.', 'AI chat assistant (LLaMA 3 70B model)'],
      ['CARTO Basemap Tiles', 'CARTO', 'Map tile layer for Leaflet'],
    ]
  ),
  emptyPara(),
  subHeading('3.4 Development Tools'),
  bullet('Git — Version control'),
  bullet('VS Code — Primary IDE'),
  bullet('Postman — API testing'),
  bullet('MongoDB Atlas — Cloud database management'),
  bullet('ESLint — Code quality enforcement'),
  pageBreak(),
);

// ─────────────────────────────────────────────────────────
// 4. SYSTEM ARCHITECTURE
// ─────────────────────────────────────────────────────────
sections.push(
  heading('4. System Architecture'),
  subHeading('4.1 High-Level Architecture'),
  para('The system follows a classic three-tier architecture:'),
  emptyPara(),
  boldPara('Presentation Layer (Frontend): ', 'React.js SPA served by Vite dev server on port 5173. Communicates with the backend via RESTful API calls using Axios.'),
  boldPara('Application Layer (Backend): ', 'Express.js server on port 5000. Handles all business logic including route optimization, simulation, fleet management, and AI chat. Connects to external APIs (Groq LLM, OSRM).'),
  boldPara('Data Layer (Database): ', 'MongoDB Atlas cloud cluster. Stores zones, trucks, routes, flags, drivers, and audit logs. Accessed via Mongoose ODM with schema validation.'),
  emptyPara(),
  subHeading('4.2 Data Flow'),
  para('1. User interacts with React frontend (Dashboard, Helper Panel, Simulation, Driver View)'),
  para('2. Frontend sends HTTP requests to Express backend API endpoints'),
  para('3. Backend queries MongoDB for current state, runs algorithms, and returns results'),
  para('4. For AI chat queries, backend constructs a prompt with live database context and sends it to Groq LLM'),
  para('5. Route deployment triggers writes to MongoDB and signals all connected frontend views via the routeSync utility'),
  para('6. OSRM API is called client-side for map polyline rendering'),
  emptyPara(),
  subHeading('4.3 Project Structure'),
  para('municipal-waste-app/', { bold: true }),
  bullet('backend/'),
  subBullet('server.js — Express server entry point, CORS, route mounting'),
  subBullet('models/ — Mongoose schemas (Zone, Truck, Route, Flag, Driver, AuditLog)'),
  subBullet('routes/ — API route handlers (helper.js, simulation.js, trucks.js, zones.js, drivers.js, reports.js)'),
  subBullet('utils/routingEngine.js — Core algorithms (Haversine, greedy optimizer, bin simulation, fleet optimizer)'),
  subBullet('seed.js — Database seeding script (42 zones, 27 trucks)'),
  bullet('frontend/'),
  subBullet('src/App.jsx — Root component with auth, routing, navbar, SystemBadge'),
  subBullet('src/pages/ — LoginPage, Dashboard, Simulation, AIPanel, DriverView, DriverMobile'),
  subBullet('src/components/MapView.jsx — Leaflet map with OSRM routing, zone polygons, truck markers'),
  subBullet('src/utils/api.js — Axios API client with all endpoint functions'),
  subBullet('src/utils/routeSync.js — Cross-tab route deployment synchronization'),
  subBullet('src/utils/generateReport.js — PDF generation with jsPDF'),
  subBullet('src/utils/routeUtils.js — Frontend routing utilities'),
  pageBreak(),
);

// ─────────────────────────────────────────────────────────
// 5. DATABASE DESIGN
// ─────────────────────────────────────────────────────────
sections.push(
  heading('5. Database Design'),
  para('The application uses MongoDB (NoSQL) with 6 collections, each defined by a Mongoose schema with validation rules:'),
  emptyPara(),
  subHeading('5.1 Zone Collection'),
  para('Represents geographic waste collection areas. 42 zones seeded across 6 types.'),
  makeTable(
    ['Field', 'Type', 'Description'],
    [
      ['zoneId', 'String (unique)', 'Identifier (Z001–Z042)'],
      ['name', 'String', 'Human-readable name (e.g., "Market Area 1")'],
      ['type', 'Enum', 'Market | School | Hospital | Residential_High | Residential_Low | Industrial'],
      ['riskScore', 'Number (0–1)', 'Calculated risk based on zone type'],
      ['priorityWeight', 'Number', 'Priority for routing (Market=1.5, Hospital=1.4, etc.)'],
      ['coordinates', '[[Number]]', 'Polygon boundary as [lat, lng] pairs'],
      ['centerPoint', '[Number]', 'Center coordinate [lat, lng]'],
      ['hasBin', 'Boolean', 'Whether a smart bin has been deployed here'],
      ['binEpoch', 'Number (0–3)', 'Which simulation epoch placed the bin'],
      ['binFillLevel', 'Number (0–100)', 'Current bin fill percentage'],
      ['blockedToday', 'Boolean', 'Whether zone is blocked for today'],
      ['roadBlocked', 'Boolean', 'Whether road access is blocked'],
      ['highPriorityToday', 'Boolean', 'Elevated priority flag'],
    ]
  ),
  emptyPara(),
  subHeading('5.2 Truck Collection'),
  para('Represents waste collection vehicles. 27 trucks with Indian driver names.'),
  makeTable(
    ['Field', 'Type', 'Description'],
    [
      ['truckId', 'String (unique)', 'Identifier (T01–T27)'],
      ['driverName', 'String', 'Assigned driver name'],
      ['driverPhone', 'String', 'Driver contact number'],
      ['capacity', 'Number (0–1)', 'Maximum capacity factor'],
      ['currentLoadFactor', 'Number (0–1)', 'Current load as fraction of capacity'],
      ['status', 'Enum', 'active | inactive | standby'],
      ['assignedZones', '[String]', 'List of assigned zone IDs'],
      ['routeSequence', '[String]', 'Ordered route (zone IDs)'],
      ['estimatedDistance', 'Number', 'Route distance in km'],
      ['estimatedDuration', 'Number', 'Route duration in minutes'],
      ['depotLocation', '[Number]', 'Starting depot coordinate [lat, lng]'],
    ]
  ),
  emptyPara(),
  subHeading('5.3 Other Collections'),
  boldPara('Route: ', 'Stores deployed route snapshots per truck per day. Fields: date, truckId, routeSequence, status (draft/deployed/completed), approvedBy, totalDistance.'),
  boldPara('Flag: ', 'Driver-submitted field reports. Types: road_blocked, overloaded, skipped, delay. Fields: flagId, truckId, zoneId, type, skipReason, status (pending/acknowledged/actioned).'),
  boldPara('AuditLog: ', 'Immutable record of all system actions. Fields: timestamp, actor (admin/driver/system/ai), action, details, outcome.'),
  boldPara('Driver: ', 'Driver authentication data. Fields: truckId, name, todayRouteAcknowledged, routeSequence.'),
  pageBreak(),
);

// ─────────────────────────────────────────────────────────
// 6. BACKEND API
// ─────────────────────────────────────────────────────────
sections.push(
  heading('6. Backend API Design'),
  para('The backend exposes RESTful endpoints organized by resource. All responses follow JSON format.'),
  emptyPara(),
  subHeading('6.1 API Endpoints'),
  makeTable(
    ['Method', 'Endpoint', 'Description'],
    [
      ['GET', '/api/trucks', 'List all trucks with zone data'],
      ['GET', '/api/trucks/:id', 'Get single truck details'],
      ['PUT', '/api/trucks/:id', 'Update truck fields'],
      ['GET', '/api/zones', 'List all zones'],
      ['GET', '/api/zones/:id', 'Get single zone details'],
      ['PUT', '/api/zones/:id', 'Update zone fields'],
      ['POST', '/api/ai/chat', 'AI chat query (Groq LLM)'],
      ['POST', '/api/ai/action', 'Execute helper action (reroute, block, prioritize, optimize)'],
      ['POST', '/api/ai/action/deploy', 'Deploy proposed route changes to live database'],
      ['GET', '/api/simulation/state', 'Get current simulation state'],
      ['POST', '/api/simulation/epoch/:number/run', 'Run bin placement epoch'],
      ['POST', '/api/simulation/epoch/:number/deploy', 'Deploy epoch results to live database'],
      ['POST', '/api/simulation/fleet/optimize', 'Run fleet optimization with target size'],
      ['POST', '/api/simulation/fleet/deploy', 'Deploy fleet optimization to live database'],
      ['GET', '/api/reports/summary', 'Get system summary metrics'],
      ['GET', '/api/drivers/:id', 'Get driver data by truck ID'],
      ['POST', '/api/drivers/:id/acknowledge', 'Acknowledge today\'s route'],
      ['POST', '/api/flags', 'Submit a driver flag/incident'],
      ['GET', '/api/flags', 'List all flags'],
      ['GET', '/api/audit', 'List audit log entries'],
    ]
  ),
  emptyPara(),
  subHeading('6.2 Helper Panel Actions'),
  para('The AI helper panel supports 6 distinct action types, each processed through POST /api/ai/action:'),
  bullet('road_blocked — Mark a zone\'s road as blocked, remove from truck route, identify backup absorber truck'),
  bullet('area_priority — Elevate a zone to first-stop priority for its assigned truck'),
  bullet('area_blocked — Block entire zone, redistribute load to nearest available truck'),
  bullet('reroute_truck — Manual reroute with explicit zone sequence OR legacy exclude-zones mode'),
  bullet('intelligent_route_optimize — Joint optimization considering bin fill levels and area priorities'),
  bullet('deploy — Commit any proposed changes to the live MongoDB database'),
  pageBreak(),
);

// ─────────────────────────────────────────────────────────
// 7. FRONTEND ARCHITECTURE
// ─────────────────────────────────────────────────────────
sections.push(
  heading('7. Frontend Architecture'),
  subHeading('7.1 Component Hierarchy'),
  para('App.jsx (Root) — Manages authentication state, renders navbar with role-based navigation, and provides routing.'),
  emptyPara(),
  boldPara('LoginPage: ', 'Premium two-panel login with role toggle (Admin/Driver), animated backgrounds, error handling.'),
  boldPara('Dashboard: ', 'Main operational view with stat cards (Active Trucks, Total Zones, Deployed Today, Pending Flags, Avg Load), Leaflet map with OSRM routes, truck list panel with tabs (Trucks/Flags/Audit), PDF download.'),
  boldPara('Simulation: ', 'Smart bin deployment simulation with 3 epochs, fleet optimization with slider (min 15), before/after metrics comparison, deploy functionality.'),
  boldPara('AIPanel (Helper Panel): ', 'AI chat assistant, 6 action cards (Road Blocked, Area Priority, Area Blocked, Manual Reroute, Intelligent Route Optimization), preview/deploy workflow.'),
  boldPara('DriverView: ', 'Driver-facing page with today\'s route, acknowledge button, flag submission form, flags list, and map. Accepts truckId as prop for auto-login.'),
  boldPara('DriverMobile: ', 'Mobile-optimized driver interface for QR-code/direct URL access (/driver/:truckId).'),
  emptyPara(),
  subHeading('7.2 Shared Components'),
  boldPara('MapView.jsx: ', '855 lines. Full-featured Leaflet map component with zone polygons, truck markers, OSRM road routing, route colours, cache management, and rate-limited API requests.'),
  boldPara('SystemBadge: ', 'Navbar component showing system state (S0 Baseline / S1 Bins Active / S2 Fleet Optimized) with expandable metrics dropdown.'),
  emptyPara(),
  subHeading('7.3 State Management'),
  para('The application uses React local state (useState/useEffect) exclusively — no external state library. Cross-component communication is achieved through:'),
  bullet('Props for parent-child data flow'),
  bullet('routeSync.js utility for cross-tab deployment event propagation'),
  bullet('sessionStorage for authentication persistence'),
  pageBreak(),
);

// ─────────────────────────────────────────────────────────
// 8. CORE ALGORITHMS
// ─────────────────────────────────────────────────────────
sections.push(
  heading('8. Core Algorithms'),
  subHeading('8.1 Haversine Distance Formula'),
  para('Used to calculate the great-circle distance between two geographic points (latitude/longitude). Returns distance in kilometres using Earth\'s radius of 6,371 km. This is the fundamental distance metric used throughout routing calculations.'),
  emptyPara(),
  subHeading('8.2 Greedy Route Optimization'),
  para('A two-phase algorithm for generating optimized routes:'),
  boldPara('Phase 1 — Priority Sorting: ', 'Zones are sorted by priority weight descending. Market zones (1.5) and Hospital/School zones (1.4) are prioritized over Residential (1.0/0.7) and Industrial (1.2).'),
  boldPara('Phase 2 — Nearest-Neighbour: ', 'Starting from the depot, the algorithm iteratively selects the next zone with the lowest effective distance (distance / priorityWeight). This biases toward nearby high-priority zones.'),
  para('Time complexity: O(n²) where n = number of zones per truck. Efficient for current fleet sizes (1–3 zones per truck).'),
  emptyPara(),
  subHeading('8.3 Intelligent Route Optimization'),
  para('A more advanced optimization that jointly considers bin fill levels and area priorities:'),
  boldPara('Urgency Score: ', 'For each zone: Urgency = (fillLevel/100) × priorityWeight × (blockedToday ? 0.1 : 1.0) × (highPriority ? 1.5 : 1.0)'),
  boldPara('Route Scoring: ', 'Score = Urgency - (Distance × 1.5). This additive linear penalty ensures urgency overrides depot proximity while distance acts as a secondary tie-breaker.'),
  para('The algorithm only proposes route changes when the new ordering differs meaningfully from the existing route, avoiding false "no changes" responses.'),
  emptyPara(),
  subHeading('8.4 Bin Epoch Simulation'),
  para('Smart bin deployment follows a 3-epoch strategy based on zone risk scores:'),
  bullet('Epoch 1: Deploy bins to the top 20% highest-risk zones'),
  bullet('Epoch 2: Deploy to the next 20% (cumulative 40%)'),
  bullet('Epoch 3: Deploy to the next 15% (cumulative 55%)'),
  para('Each bin deployment reduces the zone\'s priority weight by 0.4 (minimum 0.1), reflecting faster collection at smart-bin-equipped zones.'),
  emptyPara(),
  subHeading('8.5 Fleet Optimization'),
  para('Determines whether the fleet can be reduced to a target size by redistributing zones:'),
  bullet('Collects all assigned zones from all trucks'),
  bullet('Activates only the target number of trucks'),
  bullet('Redistributes zones using round-robin assignment'),
  bullet('Recalculates load factors and route metrics for each remaining truck'),
  bullet('Minimum fleet size enforced: 15 trucks'),
  emptyPara(),
  subHeading('8.6 Alternative Route Generation'),
  para('When a road blockage is reported, the system generates 3 alternative routes:'),
  bullet('Strategy 1: Skip blocked zones (shortest route)'),
  bullet('Strategy 2: Substitute blocked zones with nearest unassigned alternatives'),
  bullet('Strategy 3: Reverse-priority ordering (serve low-priority first to clear congested paths)'),
  pageBreak(),
);

// ─────────────────────────────────────────────────────────
// 9. KEY FEATURES
// ─────────────────────────────────────────────────────────
sections.push(
  heading('9. Key Features'),
  subHeading('9.1 AI Chat Assistant'),
  para('Powered by Groq Cloud (LLaMA 3 70B model). The system constructs a comprehensive prompt containing live database context — truck status, zone conditions, flags, routes, audit logs — and sends natural language queries for immediate operational insights.'),
  emptyPara(),
  subHeading('9.2 Manual Rerouting'),
  para('Admins can define custom routes through a structured zone-sequence builder:'),
  bullet('Select a truck from dropdown (showing zone count)'),
  bullet('"Load Current Route" to clone existing sequence'),
  bullet('Add zones from a filtered dropdown picker'),
  bullet('Reorder stops with ▲/▼ buttons'),
  bullet('Remove stops with ✕ button'),
  bullet('Visual preview chain (Z005 → Z007 → Z009)'),
  bullet('Preview impact before deploying'),
  emptyPara(),
  subHeading('9.3 Dashboard'),
  para('Real-time operational control centre with:'),
  bullet('5 stat cards: Active Trucks, Total Zones, Deployed Today, Pending Flags, Avg Load'),
  bullet('Interactive Leaflet map with OSRM road routing and colour-coded truck routes'),
  bullet('Tabbed truck panel with route details, load bars, distance/duration metrics'),
  bullet('Flags panel for incident management'),
  bullet('Audit log for system activity tracking'),
  bullet('Batch PDF download for all truck route documents'),
  emptyPara(),
  subHeading('9.4 Simulation & Planning'),
  para('Three-epoch bin deployment simulation with live preview of impact on routes, distances, and collection times. Fleet optimization with adjustable slider and before/after metrics comparison.'),
  pageBreak(),
);

// ─────────────────────────────────────────────────────────
// 10. AUTHENTICATION
// ─────────────────────────────────────────────────────────
sections.push(
  heading('10. Authentication & Authorization'),
  subHeading('10.1 Login System'),
  para('The application implements a role-based login system with two access levels:'),
  emptyPara(),
  boldPara('Admin Login: ', 'Username/password authentication (admin/admin123 for demo). Grants full access to Dashboard, Simulation, Helper Panel, and Driver View admin page.'),
  boldPara('Driver Login: ', 'Truck ID-based authentication (e.g., T01, T05). No password required. Grants access only to the Driver View for the authenticated truck.'),
  emptyPara(),
  subHeading('10.2 Session Management'),
  bullet('Authentication state stored in browser sessionStorage'),
  bullet('Session persists across page refreshes within the same browser tab'),
  bullet('Session clears automatically when the browser tab is closed'),
  bullet('Logout button clears session and returns to login page'),
  emptyPara(),
  subHeading('10.3 Access Control'),
  makeTable(
    ['Feature', 'Admin', 'Driver'],
    [
      ['Dashboard', 'Full access', 'No access'],
      ['Simulation', 'Full access', 'No access'],
      ['Helper Panel', 'Full access', 'No access'],
      ['Driver View', 'All trucks', 'Own truck only'],
      ['Route Deployment', 'Yes', 'No'],
      ['Flag Submission', 'Yes (via panel)', 'Yes (own route)'],
      ['PDF Download', 'All trucks', 'No'],
    ]
  ),
  pageBreak(),
);

// ─────────────────────────────────────────────────────────
// 11. REAL-TIME SYNC
// ─────────────────────────────────────────────────────────
sections.push(
  heading('11. Real-Time Synchronization'),
  subHeading('11.1 The Problem'),
  para('After deploying route-related changes (fleet optimization, intelligent route reordering, manual rerouting), different parts of the system showed inconsistent or outdated routes. The Dashboard might show old truck counts while the Helper Panel showed new ones.'),
  emptyPara(),
  subHeading('11.2 Solution — routeSync.js'),
  para('A centralized synchronization utility using a dual-signaling approach:'),
  boldPara('CustomEvent: ', 'Triggers immediate re-fetches for components mounted in the same browser tab. All route-consuming components subscribe to the custom "route-deploy" event.'),
  boldPara('localStorage: ', 'Triggers re-fetches for components in other browser tabs/windows via the "storage" event. A timestamped key is written on each deployment.'),
  emptyPara(),
  subHeading('11.3 Deployment Triggers'),
  para('The signalRouteDeploy() function is called after every route-affecting action:'),
  bullet('Fleet Optimization deployment'),
  bullet('Intelligent Route Optimization deployment'),
  bullet('Manual Reroute deployment'),
  bullet('Road Blocked / Area Blocked deployment'),
  bullet('High Priority Area deployment'),
  bullet('Simulation Epoch deployment'),
  emptyPara(),
  subHeading('11.4 Subscribing Components'),
  para('All major components use onRouteDeploy() to immediately refresh their data:'),
  bullet('Dashboard — Re-fetches trucks, zones, and summary metrics'),
  bullet('SystemBadge — Re-fetches system state and bin counts'),
  bullet('DriverView — Re-fetches driver route and zone data'),
  bullet('DriverMobile — Re-fetches truck assignment data'),
  pageBreak(),
);

// ─────────────────────────────────────────────────────────
// 12. PDF REPORT
// ─────────────────────────────────────────────────────────
sections.push(
  heading('12. PDF Report Generation'),
  para('The system generates professional PDF route documents for each truck using jsPDF and jspdf-autotable:'),
  emptyPara(),
  subHeading('12.1 PDF Content'),
  bullet('Header bar with "Modasa Municipal Waste Management" branding, date, and timestamp'),
  bullet('Truck info box with driver name, phone, distance, duration, and load factor bar'),
  bullet('Route map — Canvas-rendered schematic with numbered stop circles, route lines, direction arrows, and zone labels. First stop green, last stop red.'),
  bullet('Stop sequence table with zone name, type, priority level (LOW/MEDIUM/HIGH), estimated arrival time, and special notes'),
  bullet('Special instructions section'),
  bullet('Footer with admin approval and generation timestamp'),
  emptyPara(),
  subHeading('12.2 Export Options'),
  bullet('Single truck PDF download from Dashboard truck panel'),
  bullet('Batch download: all active truck PDFs bundled into a ZIP file via JSZip'),
  pageBreak(),
);

// ─────────────────────────────────────────────────────────
// 13. MAP INTEGRATION
// ─────────────────────────────────────────────────────────
sections.push(
  heading('13. Map Integration'),
  subHeading('13.1 Technology'),
  para('The map uses Leaflet.js with React-Leaflet wrappers, rendering on CARTO voyager basemap tiles. Zone boundaries are drawn as polygons, trucks as custom coloured markers, and routes as polylines.'),
  emptyPara(),
  subHeading('13.2 OSRM Road Routing'),
  para('Instead of drawing straight lines between zone centers, the system calls the Open Source Routing Machine (OSRM) API to get actual road-following polylines. Key features:'),
  bullet('Route cache (osrmCache Map) to avoid redundant API calls'),
  bullet('Request queue with 300ms rate limiting to prevent OSRM throttling'),
  bullet('Graceful fallback to straight-line polylines if OSRM fails'),
  bullet('15 distinct route colours for visual truck differentiation'),
  emptyPara(),
  subHeading('13.3 Map UX'),
  bullet('Ctrl + Scroll to zoom (prevents accidental zoom during page scrolling)'),
  bullet('Zone polygons coloured by type with opacity'),
  bullet('Truck markers with route-coloured circles'),
  bullet('Smart bin icons for zones with deployed bins'),
  bullet('Road blocked / Area blocked visual indicators'),
  pageBreak(),
);

// ─────────────────────────────────────────────────────────
// 14. PROBLEMS & SOLUTIONS
// ─────────────────────────────────────────────────────────
sections.push(
  heading('14. Problems Faced & Solutions'),
  emptyPara(),
  subHeading('14.1 Route Optimization Producing No Changes'),
  boldPara('Problem: ', 'The Intelligent Route Optimization frequently reported "No changes were made" even when bin fill levels clearly indicated route reordering was needed.'),
  boldPara('Root Cause: ', 'The original scoring formula used (Urgency²) / (Distance + 0.1). The division-based formula caused distance to dominate urgency, preventing meaningful reordering.'),
  boldPara('Solution: ', 'Replaced with an additive linear penalty: Score = Urgency - (Distance × 1.5). This ensures urgency is the primary driver of route reordering while distance acts as a tie-breaker.'),
  emptyPara(),
  subHeading('14.2 Stale Data After Route Deployment'),
  boldPara('Problem: ', 'After deploying fleet optimization or route changes, the Dashboard, Driver View, and System Badge continued showing outdated data until manual page refresh.'),
  boldPara('Root Cause: ', 'Each component fetched data independently on mount but had no mechanism to detect when data changed due to deployments from other components.'),
  boldPara('Solution: ', 'Created routeSync.js — a centralized event-based synchronization utility using CustomEvent + localStorage for same-tab and cross-tab coordination.'),
  emptyPara(),
  subHeading('14.3 Manual Rerouting Was Unreliable'),
  boldPara('Problem: ', 'The original manual reroute used a vague textarea where admins typed zone IDs. This was error-prone and unpredictable.'),
  boldPara('Solution: ', 'Replaced with a structured zone-sequence builder UI: dropdown truck selector, "Load Current Route" button, zone picker with filtered dropdown, ordered stop list with reorder/remove controls, and visual route chain preview.'),
  emptyPara(),
  subHeading('14.4 Map Scroll/Zoom Interference'),
  boldPara('Problem: ', 'Users accidentally zoomed the map while scrolling the page, disrupting the browsing experience.'),
  boldPara('Solution: ', 'Implemented "Ctrl + Scroll to zoom" behavior using Leaflet\'s scrollWheelZoom option, preventing accidental zoom during normal page scrolling.'),
  emptyPara(),
  subHeading('14.5 Straight-Line Route Display'),
  boldPara('Problem: ', 'Routes were displayed as straight lines between zone centers, making the map unrealistic and unprofessional.'),
  boldPara('Solution: ', 'Integrated OSRM API for real road-following polylines with caching, rate limiting, and graceful fallback to straight lines if the API fails.'),
  emptyPara(),
  subHeading('14.6 OSRM Rate Limiting'),
  boldPara('Problem: ', 'Rapid concurrent requests to the OSRM public server caused HTTP 429 (Too Many Requests) errors.'),
  boldPara('Solution: ', 'Implemented a request queue with 300ms delay between requests, plus a persistent cache (Map object) to avoid re-fetching previously computed routes.'),
  emptyPara(),
  subHeading('14.7 PDF Map Was Blank'),
  boldPara('Problem: ', 'The PDF route documents showed a "Route Map — See app map for interactive view" placeholder instead of an actual map image.'),
  boldPara('Solution: ', 'Created a Canvas-based static map renderer (generateStaticMapImage) that draws route lines with glow effects, numbered stop circles with colour coding, direction arrows, and zone labels.'),
  emptyPara(),
  subHeading('14.8 Uniform Bin Fill Levels'),
  boldPara('Problem: ', 'All dustbins initially appeared as 50% full, making the Intelligent Route Optimization demonstrate no meaningful differences in urgency.'),
  boldPara('Solution: ', 'Implemented randomized initial fill levels based on zone type: Market zones 60-90%, Hospital/School zones 50-80%, Residential 30-70%, Industrial 40-75%.'),
  pageBreak(),
);

// ─────────────────────────────────────────────────────────
// 15. TESTING
// ─────────────────────────────────────────────────────────
sections.push(
  heading('15. Testing & Validation'),
  subHeading('15.1 Testing Methodology'),
  para('The system was tested through comprehensive browser-based validation covering all features:'),
  emptyPara(),
  makeTable(
    ['Test Area', 'Test Cases', 'Result'],
    [
      ['Login Page', 'Admin login, wrong credentials, driver login, role toggle, logout', 'All Passed'],
      ['Dashboard', 'Stat cards, truck list, map rendering, OSRM routes, flags tab', 'All Passed'],
      ['Simulation', 'Epoch 1/2/3 execution, bin deployment, fleet optimization, slider min 15', 'All Passed'],
      ['Helper Panel', 'Road blocked, area priority, area blocked actions', 'All Passed'],
      ['Manual Reroute', 'Truck select, load route, add zones, reorder, preview, deploy', 'All Passed'],
      ['Intelligent Optimization', 'Fill level adjustment, route reordering, preview results', 'All Passed'],
      ['Route Sync', 'Deploy triggers Dashboard refresh, Driver View refresh, SystemBadge update', 'All Passed'],
      ['Driver View', 'Auto-login with truckId, route acknowledgement, flag submission', 'All Passed'],
      ['PDF Generation', 'Single PDF, batch ZIP download, route map image rendering', 'All Passed'],
      ['Map UX', 'Ctrl+scroll zoom, OSRM polylines, zone polygons, truck markers', 'All Passed'],
    ]
  ),
  pageBreak(),
);

// ─────────────────────────────────────────────────────────
// 16. DEPLOYMENT
// ─────────────────────────────────────────────────────────
sections.push(
  heading('16. Deployment Guide'),
  subHeading('16.1 Prerequisites'),
  bullet('Node.js v18 or later'),
  bullet('MongoDB Atlas account (or local MongoDB instance)'),
  bullet('Groq API key (free tier available at console.groq.com)'),
  emptyPara(),
  subHeading('16.2 Environment Variables'),
  para('Create a .env file in the backend/ directory:'),
  emptyPara(),
  para('MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/municipal-waste', { bold: true }),
  para('GROQ_API_KEY=gsk_your_api_key_here', { bold: true }),
  para('PORT=5000', { bold: true }),
  para('FRONTEND_URL=http://localhost:5173', { bold: true }),
  emptyPara(),
  subHeading('16.3 Installation & Running'),
  para('Step 1: Install backend dependencies'),
  para('  cd backend && npm install', { bold: true }),
  para('Step 2: Seed the database'),
  para('  npm run seed', { bold: true }),
  para('Step 3: Start the backend server'),
  para('  npm start          (or npm run dev for development)', { bold: true }),
  para('Step 4: Install frontend dependencies'),
  para('  cd frontend && npm install', { bold: true }),
  para('Step 5: Start the frontend dev server'),
  para('  npm run dev', { bold: true }),
  para('Step 6: Open http://localhost:5173 in browser'),
  emptyPara(),
  subHeading('16.4 Default Credentials'),
  makeTable(
    ['Role', 'Username / ID', 'Password'],
    [
      ['Admin', 'admin', 'admin123'],
      ['Driver', 'T01 through T27', 'Not required'],
    ]
  ),
  pageBreak(),
);

// ─────────────────────────────────────────────────────────
// 17. FUTURE ENHANCEMENTS
// ─────────────────────────────────────────────────────────
sections.push(
  heading('17. Future Enhancements'),
  bullet('WebSocket integration for true real-time push updates instead of polling'),
  bullet('GPS-based live truck tracking with actual position updates'),
  bullet('Machine learning model for predicting bin fill rates based on historical data'),
  bullet('Mobile-native driver app (React Native or Flutter) for offline-first operation'),
  bullet('JWT-based authentication with bcrypt password hashing for production security'),
  bullet('Multi-city/multi-ward support for scaling beyond Modasa'),
  bullet('Integration with government APIs for automated reporting and compliance'),
  bullet('Advanced pathfinding using OSRM self-hosted instance for faster, unlimited routing'),
  bullet('Predictive maintenance alerts for trucks based on usage patterns'),
  bullet('Citizen-facing portal for complaint submission and collection schedule visibility'),
  pageBreak(),
);

// ─────────────────────────────────────────────────────────
// 18. CONCLUSION
// ─────────────────────────────────────────────────────────
sections.push(
  heading('18. Conclusion'),
  para('WasteRoute AI demonstrates how modern web technologies and artificial intelligence can transform municipal waste management from a manual, inefficient process into a data-driven, optimized system. The platform successfully addresses the key challenges of route optimization, fleet management, real-time monitoring, and operational decision support.'),
  emptyPara(),
  para('The system\'s modular architecture — with a clean separation between the React frontend, Express backend, and MongoDB database — ensures maintainability and scalability. The integration of the Groq LLM provides natural language operational intelligence, while the routing algorithms deliver measurable efficiency improvements through priority-weighted optimization and smart bin simulation.'),
  emptyPara(),
  para('Key technical achievements include the real-time route synchronization system (routeSync.js), the structured manual rerouting interface, the canvas-based PDF map generation, and the OSRM road routing integration — each of which required creative solutions to complex technical challenges.'),
  emptyPara(),
  para('The platform is production-ready for deployment at Modasa Municipal Corporation and can serve as a blueprint for similar smart city initiatives across India.'),
  emptyPara(), emptyPara(), emptyPara(),
  para('— End of Report —', { center: true, color: GRAY, italics: true }),
);

// ═══════════════════════════════════════════════════════════
// GENERATE DOCUMENT
// ═══════════════════════════════════════════════════════════

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 22 } },
      heading1: { run: { font: 'Calibri', size: 36, bold: true, color: PRIMARY } },
      heading2: { run: { font: 'Calibri', size: 28, bold: true, color: DARK } },
      heading3: { run: { font: 'Calibri', size: 24, bold: true, color: GRAY } },
    },
  },
  sections: [{
    properties: {
      page: {
        margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          children: [
            new TextRun({ text: 'WasteRoute AI — Project Report', font: 'Calibri', size: 16, color: GRAY, italics: true }),
          ],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'Modasa Municipal Corporation — Confidential', font: 'Calibri', size: 16, color: GRAY }),
          ],
        })],
      }),
    },
    children: sections,
  }],
});

const buffer = await Packer.toBuffer(doc);
const outputPath = 'WasteRoute_AI_Project_Report.docx';
fs.writeFileSync(outputPath, buffer);
console.log(`✅ Report generated: ${outputPath} (${(buffer.length / 1024).toFixed(0)} KB)`);

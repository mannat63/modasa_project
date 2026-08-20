/**
 * Shared helpers for materializing today's *deployed* Route snapshots.
 *
 * The app treats Truck.routeSequence as the live route, but drivers can only
 * acknowledge / run a shift against a Route document with status:'deployed'
 * for today. These helpers keep that document in sync whenever routes change.
 */
const Route = require('../models/Route');
const Truck = require('../models/Truck');

function todayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Create or update today's deployed Route for a single truck from its
 * current routeSequence + metrics. Preserves any acknowledgement/shift data.
 */
async function upsertDeployedRoute(truck, actorId = 'system', systemState = 'S1') {
  const today = todayMidnight();
  return Route.findOneAndUpdate(
    { truckId: truck.truckId, date: today },
    {
      $set: {
        routeSequence: truck.routeSequence || [],
        totalDistance: truck.estimatedDistance || 0,
        totalDuration: truck.estimatedDuration || 0,
        status: 'deployed',
        approvedBy: actorId,
        approvedAt: new Date(),
        systemState,
      },
      $setOnInsert: { date: today, truckId: truck.truckId },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
}

/** Deploy today's routes for every active truck. Returns the Route docs. */
async function deployAllActiveRoutes(actorId = 'system', systemState = 'S1') {
  const trucks = await Truck.find({ status: 'active' });
  const routes = [];
  for (const t of trucks) routes.push(await upsertDeployedRoute(t, actorId, systemState));
  return routes;
}

module.exports = { upsertDeployedRoute, deployAllActiveRoutes, todayMidnight };

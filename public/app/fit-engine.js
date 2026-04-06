export function createFitEngine({
  state,
  cloneLoadout,
  selectors,
  constants,
}) {
  const {
    getShipDefinition,
    getOutfitDefinition,
  } = selectors;
  const {
    FRAMES_PER_SECOND,
    MAX_SIMULATION_FRAMES,
  } = constants;

  function normalizeShipDisplayShip(shipRecord) {
    const shipDef = getShipDefinition(shipRecord.model);
    return {
      ...shipRecord,
      thumbnailUrl: shipDef?.thumbnailUrl || null,
      spriteUrl: shipDef?.spriteUrl || null,
      category: shipDef?.category || "Ship",
    };
  }

  function getWeaponCycleFrames(attributes) {
    const reload = Math.max(1, Number(attributes.reload) || 1);
    const burstCount = Math.max(1, Number(attributes.burstCount) || 1);
    const burstReload = Math.max(0, Number(attributes.burstReload) || 0);
    return burstCount > 1 ? burstCount * reload + burstReload : reload;
  }

  function coolingEfficiency(value) {
    const x = Number(value) || 0;
    return 2 + 2 / (1 + Math.exp(x / -2)) - 4 / (1 + Math.exp(x / -4));
  }

  function simulateScenario(summary, scenario) {
    const maxHeat = Math.max(1, summary.maximumHeat);
    const efficiency = coolingEfficiency(summary.coolingInefficiency);
    const passiveCooling = efficiency * summary.cooling;
    const activeCooling = efficiency * summary.activeCooling;
    let energy = Math.max(0, summary.energyCapacity);
    let fuel = Math.max(0, summary.fuelCapacity);
    let heat = Math.max(0, summary.idleHeat);
    let batteryEmptyAt = null;
    let overheatedAt = null;
    let fuelEmptyAt = null;

    for (let frame = 1; frame <= MAX_SIMULATION_FRAMES; frame += 1) {
      energy = Math.min(energy, summary.energyCapacity);
      fuel = Math.min(fuel, summary.fuelCapacity);
      heat = Math.max(0, heat - heat * summary.heatDissipation);

      energy += summary.energyGeneration - summary.energyConsumption;
      fuel += summary.fuelGeneration;
      heat += summary.heatGeneration;
      heat -= passiveCooling;

      if (summary.fuelConsumption <= fuel) {
        fuel -= summary.fuelConsumption;
        energy += summary.fuelEnergy;
        heat += summary.fuelHeat;
      }

      if (activeCooling > 0 && heat > 0 && energy >= 0) {
        const heatFraction = Math.min(1, heat / maxHeat);
        if (summary.coolingEnergy > 0) {
          const spentEnergy = Math.min(energy, summary.coolingEnergy * heatFraction);
          heat -= activeCooling * spentEnergy / summary.coolingEnergy;
          energy -= spentEnergy;
        } else {
          heat -= activeCooling * heatFraction;
        }
      }

      if (scenario.useShields) {
        energy -= summary.shieldEnergy;
        heat += summary.shieldHeat;
      }
      if (scenario.useThrust) {
        energy -= summary.thrustingEnergy;
        heat += summary.thrustingHeat;
      }
      if (scenario.useTurn) {
        energy -= summary.turningEnergy;
        heat += summary.turningHeat;
      }
      if (scenario.useFire) {
        energy -= summary.firingEnergyPerFrame;
        fuel -= summary.firingFuelPerFrame;
        heat += summary.firingHeatPerFrame;
      }

      if (batteryEmptyAt === null && energy <= 0 && scenario.energyDemand > 0) {
        batteryEmptyAt = frame / FRAMES_PER_SECOND;
      }
      if (fuelEmptyAt === null && fuel <= 0 && scenario.fuelDemand > 0) {
        fuelEmptyAt = frame / FRAMES_PER_SECOND;
      }
      if (overheatedAt === null && heat > maxHeat) {
        overheatedAt = frame / FRAMES_PER_SECOND;
        break;
      }

      energy = Math.max(0, energy);
      fuel = Math.max(0, fuel);
      heat = Math.max(0, heat);
    }

    return {
      batteryEmptyAt,
      fuelEmptyAt,
      overheatedAt,
    };
  }

  function buildSustainReport(summary) {
    const scenarios = [
      { key: "idle", label: "Idle", useShields: false, useThrust: false, useTurn: false, useFire: false },
      { key: "cruise", label: "Cruise", useShields: false, useThrust: true, useTurn: false, useFire: false },
      { key: "firing", label: "Firing", useShields: false, useThrust: false, useTurn: false, useFire: true },
      { key: "combat", label: "Combat", useShields: true, useThrust: true, useTurn: false, useFire: true },
    ].map((scenario) => {
      const energyDemand =
        (scenario.useShields ? summary.shieldEnergy : 0) +
        (scenario.useThrust ? summary.thrustingEnergy : 0) +
        (scenario.useTurn ? summary.turningEnergy : 0) +
        (scenario.useFire ? summary.firingEnergyPerFrame : 0);
      const fuelDemand =
        (scenario.useFire ? summary.firingFuelPerFrame : 0) + summary.fuelConsumption;
      const generationNet =
        summary.energyGeneration +
        summary.fuelEnergy -
        summary.energyConsumption -
        energyDemand;

      const simulation = simulateScenario(summary, {
        ...scenario,
        energyDemand,
        fuelDemand,
      });

      return {
        ...scenario,
        energyNet: generationNet,
        batteryEmptyAt: simulation.batteryEmptyAt,
        fuelEmptyAt: simulation.fuelEmptyAt,
        overheatedAt: simulation.overheatedAt,
      };
    });

    const combat = scenarios.find((item) => item.key === "combat");
    return {
      scenarios,
      combat,
    };
  }

  function summarizeFit(shipName, rawLoadout, options = {}) {
    const includeSustain = options.includeSustain ?? true;
    const ship = getShipDefinition(shipName);
    if (!ship) {
      return null;
    }

    const loadout = cloneLoadout(rawLoadout);
    const stats = {
      shipName,
      valid: true,
      warnings: [],
      loadout,
      cargoSpace: ship.attributes.cargoSpace,
      fuelCapacity: ship.attributes.fuelCapacity,
      bunks: ship.attributes.bunks,
      requiredCrew: ship.attributes.requiredCrew,
      mass: ship.attributes.mass,
      drag: ship.attributes.drag,
      shields: ship.attributes.shields,
      hull: ship.attributes.hull,
      heatDissipation: (ship.attributes.heatDissipation || 0) * 0.001,
      heatCapacity: ship.attributes.heatCapacity || 0,
      coolingInefficiency: ship.attributes.coolingInefficiency || 0,
      freeOutfit: ship.attributes.outfitSpace,
      freeWeapon: ship.attributes.weaponCapacity,
      freeEngine: ship.attributes.engineCapacity,
      freeGunPorts: ship.attributes.gunPorts,
      freeTurretMounts: ship.attributes.turretMounts,
      thrust: 0,
      turn: 0,
      reverseThrust: 0,
      cooling: ship.attributes.cooling || 0,
      activeCooling: ship.attributes.activeCooling || 0,
      coolingEnergy: ship.attributes.coolingEnergy || 0,
      energyGeneration: ship.attributes.energyGeneration || 0,
      energyConsumption: ship.attributes.energyConsumption || 0,
      solarCollection: ship.attributes.solarCollection || 0,
      solarHeat: ship.attributes.solarHeat || 0,
      fuelGeneration: 0,
      fuelEnergy: 0,
      fuelConsumption: 0,
      fuelHeat: 0,
      heatGeneration: ship.attributes.heatGeneration || 0,
      energyCapacity: 0,
      shieldGeneration: 0,
      shieldEnergy: 0,
      shieldHeat: 0,
      delayedShieldEnergy: ship.attributes.delayedShieldEnergy || 0,
      delayedShieldHeat: ship.attributes.delayedShieldHeat || 0,
      shieldEnergyMultiplier: ship.attributes.shieldEnergyMultiplier || 0,
      shieldHeatMultiplier: ship.attributes.shieldHeatMultiplier || 0,
      hullEnergy: ship.attributes.hullEnergy || 0,
      hullHeat: ship.attributes.hullHeat || 0,
      delayedHullEnergy: ship.attributes.delayedHullEnergy || 0,
      delayedHullHeat: ship.attributes.delayedHullHeat || 0,
      hullEnergyMultiplier: ship.attributes.hullEnergyMultiplier || 0,
      hullHeatMultiplier: ship.attributes.hullHeatMultiplier || 0,
      radarJamming: 0,
      opticalJamming: 0,
      infraredJamming: 0,
      antiMissile: 0,
      shieldDps: 0,
      hullDps: 0,
      firingEnergyPerFrame: 0,
      firingFuelPerFrame: 0,
      firingHeatPerFrame: 0,
      thrustingEnergy: 0,
      thrustingHeat: 0,
      turningEnergy: 0,
      turningHeat: 0,
      afterburnerEnergy: ship.attributes.afterburnerEnergy || 0,
      afterburnerHeat: ship.attributes.afterburnerHeat || 0,
      reverseThrustingEnergy: 0,
      reverseThrustingHeat: 0,
      outfitCost: 0,
      shipCost: ship.attributes.cost || 0,
      stockOutfitCost: 0,
    };
    const weaponEntries = [];

    for (const [outfitName, count] of Object.entries(loadout)) {
      const outfit = getOutfitDefinition(outfitName);
      if (!outfit) {
        stats.warnings.push(`Missing outfit data: ${outfitName}`);
        continue;
      }

      const attr = outfit.attributes;
      stats.outfitCost += (attr.cost || 0) * count;
      stats.mass += (attr.mass || 0) * count;
      stats.cargoSpace += (attr.cargoSpace || 0) * count;
      stats.fuelCapacity += (attr.fuelCapacity || 0) * count;
      stats.bunks += (attr.bunks || 0) * count;
      stats.requiredCrew += (attr.requiredCrew || 0) * count;
      stats.freeOutfit += (attr.outfitSpace || 0) * count;
      stats.freeWeapon += (attr.weaponCapacity || 0) * count;
      stats.freeEngine += (attr.engineCapacity || 0) * count;
      stats.freeGunPorts += (attr.gunPorts || 0) * count;
      stats.freeTurretMounts += (attr.turretMounts || 0) * count;
      stats.energyGeneration += (attr.energyGeneration || 0) * count;
      stats.energyConsumption += (attr.energyConsumption || 0) * count;
      stats.solarCollection += (attr.solarCollection || 0) * count;
      stats.solarHeat += (attr.solarHeat || 0) * count;
      stats.heatGeneration += (attr.heatGeneration || 0) * count;
      stats.energyCapacity += (attr.energyCapacity || 0) * count;
      stats.fuelGeneration += (attr.fuelGeneration || 0) * count;
      stats.fuelEnergy += (attr.fuelEnergy || 0) * count;
      stats.fuelConsumption += (attr.fuelConsumption || 0) * count;
      stats.fuelHeat += (attr.fuelHeat || 0) * count;
      stats.cooling += (attr.cooling || 0) * count;
      stats.activeCooling += (attr.activeCooling || 0) * count;
      stats.coolingEnergy += (attr.coolingEnergy || 0) * count;
      stats.coolingInefficiency += (attr.coolingInefficiency || 0) * count;
      stats.heatCapacity += (attr.heatCapacity || 0) * count;
      stats.shieldGeneration += (attr.shieldGeneration || 0) * count;
      stats.shieldEnergy += (attr.shieldEnergy || 0) * count;
      stats.shieldHeat += (attr.shieldHeat || 0) * count;
      stats.delayedShieldEnergy += (attr.delayedShieldEnergy || 0) * count;
      stats.delayedShieldHeat += (attr.delayedShieldHeat || 0) * count;
      stats.shieldEnergyMultiplier += (attr.shieldEnergyMultiplier || 0) * count;
      stats.shieldHeatMultiplier += (attr.shieldHeatMultiplier || 0) * count;
      stats.hullEnergy += (attr.hullEnergy || 0) * count;
      stats.hullHeat += (attr.hullHeat || 0) * count;
      stats.delayedHullEnergy += (attr.delayedHullEnergy || 0) * count;
      stats.delayedHullHeat += (attr.delayedHullHeat || 0) * count;
      stats.hullEnergyMultiplier += (attr.hullEnergyMultiplier || 0) * count;
      stats.hullHeatMultiplier += (attr.hullHeatMultiplier || 0) * count;
      stats.radarJamming += (attr.radarJamming || 0) * count;
      stats.opticalJamming += (attr.opticalJamming || 0) * count;
      stats.infraredJamming += (attr.infraredJamming || 0) * count;
      stats.thrust += (attr.thrust || 0) * count;
      stats.turn += (attr.turn || 0) * count;
      stats.reverseThrust += (attr.reverseThrust || 0) * count;
      stats.thrustingEnergy += (attr.thrustingEnergy || 0) * count;
      stats.thrustingHeat += (attr.thrustingHeat || 0) * count;
      stats.turningEnergy += (attr.turningEnergy || 0) * count;
      stats.turningHeat += (attr.turningHeat || 0) * count;
      stats.afterburnerEnergy += (attr.afterburnerEnergy || 0) * count;
      stats.afterburnerHeat += (attr.afterburnerHeat || 0) * count;
      stats.reverseThrustingEnergy += (attr.reverseThrustingEnergy || 0) * count;
      stats.reverseThrustingHeat += (attr.reverseThrustingHeat || 0) * count;
      stats.antiMissile += (attr.antiMissile || 0) * count;

      if (
        attr.reload ||
        attr.firingEnergy ||
        attr.firingFuel ||
        attr.firingHeat ||
        attr.relativeFiringEnergy ||
        attr.relativeFiringFuel ||
        attr.relativeFiringHeat
      ) {
        weaponEntries.push({ attr, count });
      }
    }

    stats.usedOutfit = ship.attributes.outfitSpace - stats.freeOutfit;
    stats.usedWeapon = ship.attributes.weaponCapacity - stats.freeWeapon;
    stats.usedEngine = ship.attributes.engineCapacity - stats.freeEngine;
    stats.usedGunPorts = ship.attributes.gunPorts - stats.freeGunPorts;
    stats.usedTurretMounts = ship.attributes.turretMounts - stats.freeTurretMounts;
    stats.maxSpeed = stats.drag ? (60 * stats.thrust) / stats.drag : 0;
    stats.acceleration = stats.mass ? (3600 * stats.thrust) / stats.mass : 0;
    stats.turning = stats.mass ? (60 * stats.turn) / stats.mass : 0;
    stats.shieldDps = Math.round(stats.shieldDps * 10) / 10;
    stats.hullDps = Math.round(stats.hullDps * 10) / 10;
    stats.maximumHeat = 100 * Math.max(1, stats.mass + stats.heatCapacity);

    for (const entry of weaponEntries) {
      const { attr, count } = entry;
      const cycleFrames = getWeaponCycleFrames(attr);
      const burstCount = Math.max(1, Number(attr.burstCount) || 1);
      const energyPerCycle =
        (attr.firingEnergy || 0) +
        (attr.relativeFiringEnergy || 0) * stats.energyCapacity;
      const fuelPerCycle =
        (attr.firingFuel || 0) +
        (attr.relativeFiringFuel || 0) * stats.fuelCapacity;
      const heatPerCycle =
        (attr.firingHeat || 0) +
        (attr.relativeFiringHeat || 0) * stats.maximumHeat;

      stats.firingEnergyPerFrame += (energyPerCycle * burstCount * count) / cycleFrames;
      stats.firingFuelPerFrame += (fuelPerCycle * burstCount * count) / cycleFrames;
      stats.firingHeatPerFrame += (heatPerCycle * burstCount * count) / cycleFrames;
      stats.shieldDps += (((attr.shieldDamage || 0) * burstCount) / cycleFrames) * FRAMES_PER_SECOND * count;
      stats.hullDps += (((attr.hullDamage || 0) * burstCount) / cycleFrames) * FRAMES_PER_SECOND * count;
    }

    stats.shieldDps = Math.round(stats.shieldDps * 10) / 10;
    stats.hullDps = Math.round(stats.hullDps * 10) / 10;
    const efficiency = coolingEfficiency(stats.coolingInefficiency);
    const passiveCooling = efficiency * stats.cooling;
    const activeCooling = efficiency * stats.activeCooling;
    const idleProduction = Math.max(0, stats.heatGeneration - passiveCooling);
    const idleDissipation = stats.heatDissipation + activeCooling / stats.maximumHeat;
    stats.idleHeat =
      idleDissipation === 0
        ? idleProduction > 0
          ? Number.POSITIVE_INFINITY
          : 0
        : idleProduction / idleDissipation;
    const hasShieldRegen =
      stats.shieldGeneration > 0 ||
      stats.shieldEnergy > 0 ||
      stats.delayedShieldEnergy > 0;
    const hasHullRepair =
      stats.hullEnergy > 0 ||
      stats.delayedHullEnergy > 0 ||
      stats.hullHeat > 0 ||
      stats.delayedHullHeat > 0;
    stats.idleEnergyPerFrame =
      stats.energyGeneration +
      stats.solarCollection +
      stats.fuelEnergy -
      stats.energyConsumption -
      stats.coolingEnergy;
    stats.idleHeatPerFrame =
      stats.heatGeneration +
      stats.solarHeat +
      stats.fuelHeat -
      efficiency * (stats.cooling + stats.activeCooling);
    stats.movingEnergyPerFrame =
      Math.max(stats.thrustingEnergy, stats.reverseThrustingEnergy) +
      stats.turningEnergy +
      stats.afterburnerEnergy;
    stats.movingHeatPerFrame =
      Math.max(stats.thrustingHeat, stats.reverseThrustingHeat) +
      stats.turningHeat +
      stats.afterburnerHeat;
    stats.shieldAndHullEnergyPerFrame =
      (hasShieldRegen
        ? (stats.shieldEnergy + stats.delayedShieldEnergy) * (1 + stats.shieldEnergyMultiplier)
        : 0) +
      (hasHullRepair
        ? (stats.hullEnergy + stats.delayedHullEnergy) * (1 + stats.hullEnergyMultiplier)
        : 0);
    stats.shieldAndHullHeatPerFrame =
      (hasShieldRegen
        ? (stats.shieldHeat + stats.delayedShieldHeat) * (1 + stats.shieldHeatMultiplier)
        : 0) +
      (hasHullRepair
        ? (stats.hullHeat + stats.delayedHullHeat) * (1 + stats.hullHeatMultiplier)
        : 0);
    stats.repairLabel =
      hasShieldRegen && hasHullRepair
        ? "Shields / hull"
        : hasHullRepair
          ? "Repairing hull"
          : "Charging shields";
    stats.netEnergyPerFrame =
      stats.idleEnergyPerFrame -
      stats.movingEnergyPerFrame -
      stats.firingEnergyPerFrame -
      stats.shieldAndHullEnergyPerFrame;
    stats.netHeatPerFrame =
      stats.idleHeatPerFrame +
      stats.movingHeatPerFrame +
      stats.firingHeatPerFrame +
      stats.shieldAndHullHeatPerFrame;
    stats.displayMaxHeat = FRAMES_PER_SECOND * stats.heatDissipation * stats.maximumHeat;

    const invalid =
      stats.freeOutfit < 0 ||
      stats.freeWeapon < 0 ||
      stats.freeEngine < 0 ||
      stats.freeGunPorts < 0 ||
      stats.freeTurretMounts < 0;
    stats.valid = !invalid;

    const driveOutfit = Object.keys(loadout).find((name) => {
      const outfit = getOutfitDefinition(name);
      return outfit?.attributes.hyperdrive || outfit?.attributes.scramDrive || outfit?.attributes.jumpDrive;
    });
    if (driveOutfit) {
      const drive = getOutfitDefinition(driveOutfit);
      stats.jumpFuel = drive.attributes.jumpFuel || 100;
      stats.jumpCount = Math.floor(stats.fuelCapacity / Math.max(1, stats.jumpFuel));
      stats.driveName = driveOutfit;
    } else {
      stats.jumpFuel = 0;
      stats.jumpCount = 0;
      stats.driveName = "None";
    }

    stats.stockOutfitCost = Object.entries(ship.stockOutfits || {}).reduce((sum, [name, count]) => {
      const outfit = getOutfitDefinition(name);
      return sum + (outfit?.attributes?.cost || 0) * count;
    }, 0);
    stats.totalCost = stats.shipCost + stats.outfitCost;
    stats.outfitDeltaCost = stats.outfitCost - stats.stockOutfitCost;

    if (includeSustain) {
      stats.sustain = buildSustainReport(stats);
    }

    return stats;
  }

  function getInstallCheck(shipName, loadout, outfitName, delta) {
    const next = cloneLoadout(loadout);
    next[outfitName] = Math.max(0, (next[outfitName] || 0) + delta);
    if (next[outfitName] <= 0) {
      delete next[outfitName];
    }
    const summary = summarizeFit(shipName, next, { includeSustain: false });
    if (!summary) {
      return { ok: false, reason: "Missing ship data." };
    }

    const issues = [];
    if (summary.freeOutfit < 0) {
      issues.push("Not enough outfit space");
    }
    if (summary.freeWeapon < 0) {
      issues.push("Not enough weapon capacity");
    }
    if (summary.freeEngine < 0) {
      issues.push("Not enough engine capacity");
    }
    if (summary.freeGunPorts < 0) {
      issues.push("No free gun ports");
    }
    if (summary.freeTurretMounts < 0) {
      issues.push("No free turret mounts");
    }

    return {
      ok: issues.length === 0,
      reason: issues.join(" · "),
    };
  }

  return {
    normalizeShipDisplayShip,
    summarizeFit,
    getInstallCheck,
  };
}

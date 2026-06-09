import * as THREE from 'three';
import { WORLD, AUDIENCE } from '../utils/constants.js';
import {
  getStandAisles,
  getStandAisleStairs,
  getStandBounds,
  getStandColumns,
  getStandRows,
  getStandSeatingBlockBounds
} from '../utils/venueLayout.js';
import {
  AUDIENCE_BARRIER_LAYOUT,
  HALL_LAYOUT,
  STAGE_LAYOUT,
  STAGE_SIDE_STAIR,
  STAGE_SIDE_STAIR_DEPTH
} from './stage/VenueLayoutData.js';
import {
  createStageCollisionBoxes,
  getGrandstandVisibilityBoxIds,
  getVenueWallVisibilityBoxIds
} from './stage/VenueCollision.js';
import {
  createCeilingRiggingData,
  createFloorDecalData
} from './stage/VenuePolishData.js';

export class Stage {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'ConcertEnvironment';
    this.grandstandMeshes = [];
    this.venueWallMeshes = [];
    this.wingMeshes = [];
    this.trimLights = [];
    this.lightBeams = [];
    this.createMaterials();
    this.buildFloor();
    this.buildStage();
    this.buildGrandstand();
    this.buildVenuePolish();
  }

  createMaterials() {
    this.materials = {
      deck: new THREE.MeshStandardMaterial({ color: 0x2e3139, roughness: 0.55, metalness: 0.08 }),
      runway: new THREE.MeshStandardMaterial({ color: 0x3a3e47, roughness: 0.6 }),
      wall: new THREE.MeshStandardMaterial({ color: 0x12151d, roughness: 0.5 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x89919e, metalness: 0.55, roughness: 0.25 }),
      darkMetal: new THREE.MeshStandardMaterial({ color: 0x171b22, roughness: 0.46, metalness: 0.22 }),
      stand: new THREE.MeshStandardMaterial({ color: 0x38414c, roughness: 0.72 }),
      standAlt: new THREE.MeshStandardMaterial({ color: 0x303946, roughness: 0.74 }),
      seatRed: new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.68 }),
      seatDarkRed: new THREE.MeshStandardMaterial({ color: 0x4c0f16, roughness: 0.74 }),
      aisle: new THREE.MeshStandardMaterial({ color: 0x151922, roughness: 0.82 }),
      hallWall: new THREE.MeshStandardMaterial({ color: 0x1a1111, roughness: 0.78 }),
      hallWarmLight: new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        roughness: 0.42,
        emissive: 0x9a3412,
        emissiveIntensity: 0.42
      }),
      stageEdgeLight: new THREE.MeshStandardMaterial({
        color: 0x67e8f9,
        roughness: 0.34,
        metalness: 0.12,
        emissive: 0x0e7490,
        emissiveIntensity: 0.32
      }),
      runwayInlay: new THREE.MeshStandardMaterial({
        color: 0x1f2937,
        roughness: 0.66,
        metalness: 0.1,
        emissive: 0x0f172a,
        emissiveIntensity: 0.05
      }),
      seatTrim: new THREE.MeshStandardMaterial({
        color: 0xf97316,
        roughness: 0.45,
        emissive: 0x7c2d12,
        emissiveIntensity: 0.1
      }),
      softLightBeam: new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.11,
        depthWrite: false,
        side: THREE.DoubleSide
      }),
      proscenium: new THREE.MeshStandardMaterial({ color: 0x2a1118, roughness: 0.72 }),
      rail: new THREE.MeshStandardMaterial({ color: 0xa9b2c0, roughness: 0.38, metalness: 0.42 }),
      decalWarning: new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        roughness: 0.48,
        emissive: 0x7c2d12,
        emissiveIntensity: 0.06
      }),
      decalMuted: new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.72 }),
      cable: new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, metalness: 0.35 })
    };
  }

  buildFloor() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.floorSize, WORLD.floorSize),
      new THREE.MeshStandardMaterial({ color: 0x20252c, roughness: 0.82 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    const grid = new THREE.GridHelper(WORLD.floorSize, 38, 0x4b5563, 0x303640);
    grid.position.y = 0.012;
    this.group.add(grid);
  }

  buildStage() {
    const { deck: deckLayout, backWall, runway } = STAGE_LAYOUT;
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(WORLD.stageWidth, WORLD.stageHeight, WORLD.stageDepth),
      this.materials.deck
    );
    deck.position.set(deckLayout.centerX, WORLD.stageHeight / 2, deckLayout.centerZ);
    deck.castShadow = true;
    deck.receiveShadow = true;
    this.stageDeck = deck;
    this.group.add(deck);

    const backWallMesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        WORLD.stageWidth + backWall.visualWidthExtra,
        backWall.visualHeight,
        backWall.visualDepth
      ),
      this.materials.wall
    );
    backWallMesh.position.set(backWall.centerX, backWall.centerY, backWall.centerZ);
    backWallMesh.receiveShadow = true;
    this.backWall = backWallMesh;
    this.group.add(backWallMesh);

    const runwayMesh = new THREE.Mesh(
      new THREE.BoxGeometry(runway.width, WORLD.runwayHeight, runway.depth),
      this.materials.runway
    );
    runwayMesh.position.set(runway.centerX, WORLD.runwayHeight / 2, runway.centerZ);
    runwayMesh.castShadow = true;
    runwayMesh.receiveShadow = true;
    this.runway = runwayMesh;
    this.group.add(runwayMesh);

    this.addStageDetails();
    this.addTrussFrame();
  }

  addStageDetails() {
    const { wings } = STAGE_LAYOUT;
    [-1, 1].forEach((side) => {
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(wings.width, wings.height, wings.depth),
        this.materials.darkMetal
      );
      wing.position.set(side * wings.centerAbsX, wings.centerY, wings.centerZ);
      wing.castShadow = true;
      wing.receiveShadow = true;
      this.wingMeshes.push(wing);
      this.group.add(wing);

    });

    this.addStageSurfaceAccents();
    this.addSideStageStairs();
  }

  addStageSurfaceAccents() {
    const { deck, runway, wings } = STAGE_LAYOUT;
    const deckEdgeGeometry = new THREE.BoxGeometry(WORLD.stageWidth - 1.2, 0.032, 0.055);
    const deckSideGeometry = new THREE.BoxGeometry(0.055, 0.032, WORLD.stageDepth - 0.9);
    const runwayEdgeGeometry = new THREE.BoxGeometry(0.055, 0.028, runway.depth - 0.48);
    const runwayCenterGeometry = new THREE.BoxGeometry(0.05, 0.016, runway.depth * 0.76);
    const wingAccentGeometry = new THREE.BoxGeometry(wings.width * 0.7, 0.028, 0.052);

    [
      [deck.centerX, WORLD.stageHeight + 0.032, deck.centerZ + WORLD.stageDepth / 2 - 0.12],
      [deck.centerX, WORLD.stageHeight + 0.032, deck.centerZ - WORLD.stageDepth / 2 + 0.18]
    ].forEach(([x, y, z]) => {
      const edge = new THREE.Mesh(deckEdgeGeometry, this.materials.stageEdgeLight);
      edge.position.set(x, y, z);
      this.trimLights.push(edge);
      this.group.add(edge);
    });

    [-1, 1].forEach((side) => {
      const sideEdge = new THREE.Mesh(deckSideGeometry, this.materials.stageEdgeLight);
      sideEdge.position.set(
        deck.centerX + side * (WORLD.stageWidth / 2 - 0.18),
        WORLD.stageHeight + 0.032,
        deck.centerZ
      );
      this.trimLights.push(sideEdge);
      this.group.add(sideEdge);

      const runwayEdge = new THREE.Mesh(runwayEdgeGeometry, this.materials.stageEdgeLight);
      runwayEdge.position.set(
        runway.centerX + side * (runway.width / 2 - 0.16),
        WORLD.runwayHeight + 0.03,
        runway.centerZ
      );
      this.trimLights.push(runwayEdge);
      this.group.add(runwayEdge);

      const wingAccent = new THREE.Mesh(wingAccentGeometry, this.materials.stageEdgeLight);
      wingAccent.position.set(side * wings.centerAbsX, wings.height + 0.032, wings.centerZ + wings.depth * 0.38);
      this.trimLights.push(wingAccent);
      this.group.add(wingAccent);
    });

    const runwayInlay = new THREE.Mesh(runwayCenterGeometry, this.materials.runwayInlay);
    runwayInlay.position.set(runway.centerX, WORLD.runwayHeight + 0.018, runway.centerZ);
    this.group.add(runwayInlay);
  }

  addSideStageStairs() {
    [-1, 1].forEach((side) => {
      const stairs = new THREE.Group();
      stairs.name = side < 0 ? 'StageLeftSideStairs' : 'StageRightSideStairs';
      stairs.userData.stairId =
        side < 0 ? 'stage-left-side-stair-walkable-ramp' : 'stage-right-side-stair-walkable-ramp';

      for (let step = 0; step < STAGE_SIDE_STAIR.stepCount; step += 1) {
        const height = WORLD.stageHeight * ((step + 1) / STAGE_SIDE_STAIR.stepCount);
        const block = new THREE.Mesh(
          new THREE.BoxGeometry(STAGE_SIDE_STAIR.blockWidth, height, STAGE_SIDE_STAIR_DEPTH),
          this.materials.darkMetal
        );
        block.position.set(
          side * (STAGE_SIDE_STAIR.blockStartX - step * STAGE_SIDE_STAIR.blockStepX),
          height / 2,
          STAGE_SIDE_STAIR.centerZ
        );
        block.castShadow = true;
        block.receiveShadow = true;
        stairs.add(block);

        const edgeLight = new THREE.Mesh(
          new THREE.BoxGeometry(
            STAGE_SIDE_STAIR.edgeWidth,
            0.025,
            STAGE_SIDE_STAIR_DEPTH * STAGE_SIDE_STAIR.edgeDepthScale
          ),
          this.materials.hallWarmLight
        );
        edgeLight.position.set(
          side * (STAGE_SIDE_STAIR.blockStartX - step * STAGE_SIDE_STAIR.blockStepX),
          height + 0.025,
          STAGE_SIDE_STAIR.centerZ
        );
        edgeLight.castShadow = true;
        this.trimLights.push(edgeLight);
        stairs.add(edgeLight);
      }

      this.group.add(stairs);
    });
  }

  addTrussFrame() {
    const { truss: trussLayout } = STAGE_LAYOUT;
    for (let i = -1; i <= 1; i += 2) {
      const truss = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, trussLayout.postHeight, 12),
        this.materials.metal
      );
      truss.position.set(i * trussLayout.postAbsX, trussLayout.postY, trussLayout.postZ);
      truss.castShadow = true;
      this.group.add(truss);
    }
  }

  buildGrandstand() {
    const rows = getStandRows(AUDIENCE);
    const columns = getStandColumns(AUDIENCE);
    const aisles = getStandAisles(AUDIENCE);
    const bounds = getStandBounds(AUDIENCE);
    const aisleStairs = getStandAisleStairs(AUDIENCE);

    rows.forEach((row) => {
      columns.forEach((column) => {
        const seatMaterial = row.row % 2 === 0 ? this.materials.seatRed : this.materials.seatDarkRed;
        const bench = new THREE.Mesh(
          new THREE.BoxGeometry(column.width, 0.26, AUDIENCE.rowDepth * 0.72),
          seatMaterial
        );
        bench.name = `GrandstandSeatRow${row.row}-${column.id}`;
        bench.position.set(column.centerX, row.y, row.z);
        bench.castShadow = true;
        bench.receiveShadow = true;
        bench.userData.standRole = 'seating-column';
        bench.userData.columnId = column.id;
        bench.userData.row = row.row;
        this.grandstandMeshes.push(bench);
        this.group.add(bench);

        const backRest = new THREE.Mesh(
          new THREE.BoxGeometry(column.width, 0.48, 0.16),
          row.row % 2 === 0 ? this.materials.seatDarkRed : this.materials.seatRed
        );
        backRest.name = `GrandstandSeatBackRow${row.row}-${column.id}`;
        backRest.position.set(column.centerX, row.y + 0.34, row.z + AUDIENCE.rowDepth * 0.38);
        backRest.castShadow = true;
        backRest.receiveShadow = true;
        backRest.userData.standRole = 'seat-back';
        backRest.userData.columnId = column.id;
        backRest.userData.row = row.row;
        this.grandstandMeshes.push(backRest);
        this.group.add(backRest);

        const seatTrim = new THREE.Mesh(
          new THREE.BoxGeometry(column.width * 0.88, 0.035, 0.045),
          this.materials.seatTrim
        );
        seatTrim.name = `GrandstandSeatTrimRow${row.row}-${column.id}`;
        seatTrim.position.set(column.centerX, row.y + 0.16, row.z - AUDIENCE.rowDepth * 0.28);
        seatTrim.userData.standRole = 'seat-trim';
        seatTrim.userData.columnId = column.id;
        seatTrim.userData.row = row.row;
        this.trimLights.push(seatTrim);
        this.grandstandMeshes.push(seatTrim);
        this.group.add(seatTrim);

        const riserFace = new THREE.Mesh(
          new THREE.BoxGeometry(column.width, 0.28, 0.08),
          row.row % 2 === 0 ? this.materials.standAlt : this.materials.stand
        );
        riserFace.name = `GrandstandRiserRow${row.row}-${column.id}`;
        riserFace.position.set(column.centerX, Math.max(0.1, row.y - 0.26), row.z - AUDIENCE.rowDepth * 0.46);
        riserFace.castShadow = true;
        riserFace.receiveShadow = true;
        riserFace.userData.standRole = 'riser-face';
        this.grandstandMeshes.push(riserFace);
        this.group.add(riserFace);
      });
    });

    aisles.forEach((aisle) => {
      const stairGroup = new THREE.Group();
      stairGroup.name = `GrandstandStairAisle-${aisle.id}`;
      stairGroup.userData.standRole = 'stair-aisle';
      stairGroup.userData.aisleId = aisle.id;

      aisleStairs
        .filter((step) => step.aisleId === aisle.id)
        .forEach((step) => {
          const stair = new THREE.Mesh(
            new THREE.BoxGeometry(step.width, step.topY, step.depth + 0.04),
            this.materials.aisle
          );
          stair.name = `GrandstandStair-${step.id}`;
          stair.position.set(step.centerX, step.topY / 2, step.centerZ);
          stair.castShadow = true;
          stair.receiveShadow = true;
          stair.userData.standRole = 'stair-step';
          stair.userData.aisleId = step.aisleId;
          stair.userData.stepIndex = step.index;
          this.grandstandMeshes.push(stair);
          stairGroup.add(stair);

          const nosing = new THREE.Mesh(
            new THREE.BoxGeometry(step.width * 0.92, 0.035, 0.055),
            this.materials.hallWarmLight
          );
          nosing.name = `GrandstandStairNosing-${step.id}`;
          nosing.position.set(step.centerX, step.topY + 0.025, step.minZ + 0.08);
          nosing.castShadow = true;
          this.trimLights.push(nosing);
          stairGroup.add(nosing);
        });

      this.group.add(stairGroup);
    });

    [-1, 1].forEach((side) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(
          AUDIENCE_BARRIER_LAYOUT.sideVisualWidth,
          AUDIENCE_BARRIER_LAYOUT.sideVisualHeight,
          bounds.depth + AUDIENCE_BARRIER_LAYOUT.sideDepthExtra
        ),
        this.materials.rail
      );
      rail.name = side < 0 ? 'AudienceLeftSideBarrier' : 'AudienceRightSideBarrier';
      rail.position.set(
        side * (bounds.width / 2 + AUDIENCE_BARRIER_LAYOUT.sideOffsetX),
        AUDIENCE_BARRIER_LAYOUT.sideY,
        bounds.centerZ
      );
      rail.castShadow = true;
      rail.userData.standRole = 'side-rail';
      rail.userData.barrierId = side < 0 ? 'audience-left-side-barrier' : 'audience-right-side-barrier';
      this.grandstandMeshes.push(rail);
      this.group.add(rail);
    });

    getStandSeatingBlockBounds(AUDIENCE).forEach((block) => {
      const frontBarrier = new THREE.Mesh(
        new THREE.BoxGeometry(
          block.width,
          AUDIENCE_BARRIER_LAYOUT.frontVisualHeight,
          AUDIENCE_BARRIER_LAYOUT.frontVisualDepth
        ),
        this.materials.rail
      );
      frontBarrier.name = `AudienceFrontBarrier-${block.id}`;
      frontBarrier.position.set(
        block.centerX,
        rows[0].y + AUDIENCE_BARRIER_LAYOUT.frontYAboveFirstRow,
        bounds.minZ + AUDIENCE_BARRIER_LAYOUT.frontOffsetZ
      );
      frontBarrier.castShadow = true;
      frontBarrier.userData.standRole = 'front-barrier';
      frontBarrier.userData.columnId = block.id;
      this.grandstandMeshes.push(frontBarrier);
      this.group.add(frontBarrier);
    });

    const rearRail = new THREE.Mesh(
      new THREE.BoxGeometry(
        bounds.width + AUDIENCE_BARRIER_LAYOUT.backWidthExtra,
        AUDIENCE_BARRIER_LAYOUT.backVisualHeight,
        AUDIENCE_BARRIER_LAYOUT.backVisualDepth
      ),
      this.materials.rail
    );
    rearRail.name = 'AudienceBackBarrier';
    rearRail.position.set(
      0,
      rows[rows.length - 1].y + AUDIENCE_BARRIER_LAYOUT.backYAboveLastRow,
      bounds.maxZ + AUDIENCE_BARRIER_LAYOUT.backOffsetZ
    );
    rearRail.castShadow = true;
    rearRail.userData.standRole = 'rear-rail';
    rearRail.userData.barrierId = 'audience-back-barrier';
    this.grandstandMeshes.push(rearRail);
    this.group.add(rearRail);

    this.addTheaterHallShell(bounds);
  }

  addTheaterHallShell(bounds) {
    const sconceGeometry = new THREE.BoxGeometry(0.08, 0.72, 0.36);
    const sconceGlowGeometry = new THREE.PlaneGeometry(1.15, 1.85);

    [-1, 1].forEach((side) => {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(
          HALL_LAYOUT.sideWallWidth,
          HALL_LAYOUT.sideWallHeight,
          bounds.depth + HALL_LAYOUT.sideWallDepthExtra
        ),
        this.materials.hallWall
      );
      wall.name = side < 0 ? 'LeftHallWall' : 'RightHallWall';
      wall.position.set(
        side * HALL_LAYOUT.sideWallAbsX,
        HALL_LAYOUT.sideWallY,
        bounds.centerZ + HALL_LAYOUT.sideWallZOffset
      );
      wall.receiveShadow = true;
      this.venueWallMeshes.push(wall);
      this.group.add(wall);

      HALL_LAYOUT.sconceZs.forEach((z, index) => {
        const sconce = new THREE.Mesh(sconceGeometry, this.materials.hallWarmLight);
        sconce.name = `HallWarmSconce-${side < 0 ? 'left' : 'right'}-${index}`;
        sconce.position.set(side * HALL_LAYOUT.sconceXAbs, 1.45 + index * 0.32, z);
        sconce.castShadow = true;
        this.group.add(sconce);

        const glow = new THREE.Mesh(sconceGlowGeometry, this.materials.softLightBeam.clone());
        glow.name = `HallSconceGlow-${side < 0 ? 'left' : 'right'}-${index}`;
        glow.position.set(side * (HALL_LAYOUT.sconceXAbs - 0.05), sconce.position.y + 0.08, z);
        glow.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        glow.userData.beamPhase = index * 0.7 + (side < 0 ? 0 : 0.35);
        this.lightBeams.push(glow);
        this.group.add(glow);

        const light = new THREE.PointLight(0xff9f45, 0.42, 7.5, 1.7);
        light.position.set(side * HALL_LAYOUT.sconceLightXAbs, sconce.position.y + 0.25, z);
        this.group.add(light);
      });
    });

    const rearWall = new THREE.Mesh(
      new THREE.BoxGeometry(
        bounds.width + HALL_LAYOUT.rearWallWidthExtra,
        HALL_LAYOUT.rearWallHeight,
        HALL_LAYOUT.rearWallDepth
      ),
      this.materials.hallWall
    );
    rearWall.name = 'RearHallWall';
    rearWall.position.set(0, HALL_LAYOUT.rearWallY, bounds.maxZ + HALL_LAYOUT.rearWallZOffset);
    rearWall.receiveShadow = true;
    this.venueWallMeshes.push(rearWall);
    this.group.add(rearWall);

    const prosceniumTop = new THREE.Mesh(
      new THREE.BoxGeometry(
        WORLD.stageWidth + HALL_LAYOUT.prosceniumTopWidthExtra,
        HALL_LAYOUT.prosceniumTopHeight,
        HALL_LAYOUT.prosceniumTopDepth
      ),
      this.materials.proscenium
    );
    prosceniumTop.name = 'StageProsceniumTop';
    prosceniumTop.position.set(0, HALL_LAYOUT.prosceniumTopY, HALL_LAYOUT.prosceniumZ);
    prosceniumTop.castShadow = true;
    this.group.add(prosceniumTop);

    [-1, 1].forEach((side) => {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(
          HALL_LAYOUT.prosceniumLegWidth,
          HALL_LAYOUT.prosceniumLegHeight,
          HALL_LAYOUT.prosceniumLegDepth
        ),
        this.materials.proscenium
      );
      leg.name = side < 0 ? 'LeftStageProsceniumLeg' : 'RightStageProsceniumLeg';
      leg.position.set(side * HALL_LAYOUT.prosceniumLegAbsX, HALL_LAYOUT.prosceniumLegY, HALL_LAYOUT.prosceniumZ);
      leg.castShadow = true;
      this.group.add(leg);
    });
  }

  buildVenuePolish() {
    this.addFloorDecals();
    this.addCeilingRigging();
  }

  addFloorDecals() {
    createFloorDecalData().forEach((decal) => {
      const material = getDecalMaterial(this.materials, decal.color);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(decal.width, 0.012, decal.depth), material);
      mesh.position.set(decal.x, 0.026, decal.z);
      mesh.rotation.y = decal.rotation;
      mesh.receiveShadow = true;
      mesh.userData.decalId = decal.id;
      this.group.add(mesh);
    });

    for (let i = 0; i < 6; i += 1) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(WORLD.floorSize * 0.72, 0.008, 0.035), this.materials.decalMuted);
      seam.position.set(0, 0.021, -24 + i * 7.2);
      seam.receiveShadow = true;
      this.group.add(seam);
    }
  }

  addCeilingRigging() {
    const rigging = createCeilingRiggingData();
    rigging.crossBeams.forEach((beam) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(beam.width, beam.height, beam.depth), this.materials.metal);
      mesh.position.set(beam.x, beam.y, beam.z);
      mesh.castShadow = true;
      this.group.add(mesh);
    });

    rigging.sideBeams.forEach((beam) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(beam.width, beam.height, beam.depth), this.materials.metal);
      mesh.position.set(beam.x, beam.y, beam.z);
      mesh.castShadow = true;
      this.group.add(mesh);
    });

    rigging.cables.forEach((cable) => {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(cable.radius, cable.radius, cable.height, 8),
        this.materials.cable
      );
      mesh.position.set(cable.x, cable.y, cable.z);
      this.group.add(mesh);
    });
  }

  update(time) {
    const pulse = 0.13 + (Math.sin(time * 0.85) + 1) * 0.045;
    this.trimLights.forEach((mesh, index) => {
      mesh.material.emissiveIntensity = pulse + (index % 3) * 0.012;
    });

    this.lightBeams.forEach((beam) => {
      beam.material.opacity = 0.08 + (Math.sin(time * 0.7 + beam.userData.beamPhase) + 1) * 0.025;
    });
  }

  getCollisionBoxes() {
    return createStageCollisionBoxes(AUDIENCE);
  }

  getVisibilityTargets() {
    return [
      { id: 'stage-deck', boxIds: ['stage-deck'], object: this.stageDeck },
      { id: 'stage-runway', boxIds: ['stage-runway'], object: this.runway },
      { id: 'stage-back-wall', boxIds: ['stage-back-wall'], object: this.backWall },
      {
        id: 'stage-wings',
        boxIds: ['stage-left-wing', 'stage-right-wing'],
        objects: this.wingMeshes
      },
      {
        id: 'grandstand-seating',
        boxIds: getGrandstandVisibilityBoxIds(AUDIENCE),
        objects: this.grandstandMeshes
      },
      {
        id: 'venue-walls',
        boxIds: getVenueWallVisibilityBoxIds(),
        objects: this.venueWallMeshes
      }
    ];
  }

}

function getDecalMaterial(materials, color) {
  if (color === 'warning') {
    return materials.decalWarning;
  }

  if (color === 'muted') {
    return materials.decalMuted;
  }

  return materials.decalMuted;
}

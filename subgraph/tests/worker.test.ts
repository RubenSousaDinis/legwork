import { BigInt } from "@graphprotocol/graph-ts";
import { afterEach, assert, clearStore, describe, test } from "matchstick-as/assembly/index";
import {
  handleWorkerRegistered,
  handleWorkerReset,
  handleWorkerSeeded,
} from "../src/mappings/worker-registry";
import { addr, mockWorkerRegistered, mockWorkerReset, mockWorkerSeeded } from "./utils";

const REAL = "0x1111111111111111111111111111111111111111";
const DEMO = "0x2222222222222222222222222222222222222222";

describe("seededComesFromEventOnly", () => {
  afterEach(() => {
    clearStore();
  });

  test("seededComesFromEventOnly", () => {
    // A registered human is never seeded — not by area, not by address, not by id range.
    handleWorkerRegistered(mockWorkerRegistered(BigInt.fromI32(42), addr(REAL), "dr5rs", 3));
    assert.fieldEquals("Worker", REAL, "seeded", "false");
    assert.fieldEquals("Worker", REAL, "reset", "false");
    assert.fieldEquals("Worker", REAL, "completed", "0");
    assert.fieldEquals("Worker", REAL, "distinctRaters", "0");
    assert.fieldEquals("Worker", REAL, "score", "0");

    // WorkerSeeded on an address the index has never seen creates the row already seeded.
    handleWorkerSeeded(mockWorkerSeeded(BigInt.fromI32(7), addr(DEMO), "dr5rs", 3));
    assert.fieldEquals("Worker", DEMO, "seeded", "true");

    // The other two handlers are the whole rest of this data source, and neither writes
    // the field: a reset flips `reset` and leaves `seeded` alone, and a re-registration
    // of the seeded address does not launder it back into looking real.
    handleWorkerReset(mockWorkerReset(BigInt.fromI32(42), addr(REAL)));
    assert.fieldEquals("Worker", REAL, "reset", "true");
    assert.fieldEquals("Worker", REAL, "seeded", "false");

    handleWorkerRegistered(mockWorkerRegistered(BigInt.fromI32(8), addr(DEMO), "dr5rs", 3));
    assert.fieldEquals("Worker", DEMO, "seeded", "true");
  });
});

import { afterEach, assert, clearStore, describe, test } from "matchstick-as/assembly/index";
import {
  handleBuyerAllowlisted,
  handleTaskPosted,
} from "../src/mappings/task-escrow";
import { addr, mockBuyerAllowlisted, mockTaskPosted } from "./utils";

const OPERATOR = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OUTSIDER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SECOND_OUTSIDER = "0xcccccccccccccccccccccccccccccccccccccccc";
const AREA = "dr5rs";

describe("posterStatsExcludesAllowlisted", () => {
  afterEach(() => {
    clearStore();
  });

  test("posterStatsExcludesAllowlisted", () => {
    // The operator allowlists its own buyer at deploy time (T-14), before it posts
    // anything. Its own demo traffic is therefore never external demand, and an honest
    // green demo reads `distinctExternalBuyers: 0`.
    handleBuyerAllowlisted(mockBuyerAllowlisted(addr(OPERATOR), true));
    handleTaskPosted(mockTaskPosted(1, addr(OPERATOR), AREA));
    handleTaskPosted(mockTaskPosted(2, addr(OPERATOR), AREA));
    assert.fieldEquals("PosterStats", "global", "distinctExternalBuyers", "0");
    assert.fieldEquals("PosterStats", "global", "externalTasks", "0");

    // A buyer nobody allowlisted is the number the W3 gate is judged on.
    handleTaskPosted(mockTaskPosted(3, addr(OUTSIDER), AREA));
    handleTaskPosted(mockTaskPosted(4, addr(OUTSIDER), AREA));
    assert.fieldEquals("PosterStats", "global", "distinctExternalBuyers", "1");
    assert.fieldEquals("PosterStats", "global", "externalTasks", "2");

    // A second one moves the distinct count exactly once more.
    handleTaskPosted(mockTaskPosted(5, addr(SECOND_OUTSIDER), AREA));
    assert.fieldEquals("PosterStats", "global", "distinctExternalBuyers", "2");
    assert.fieldEquals("PosterStats", "global", "externalTasks", "3");
  });
});

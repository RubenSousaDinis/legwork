import { JsonPlaceIndex, type PlaceExtract, type PlaceIndex, type Poi } from '../gate/place-index';
import { ATTRIBUTION } from './buildExtract';

/** The region name the extra layer carries: these POIs came off the wire, not out of a file. */
const LIVE_REGION = 'live-lookup';

/**
 * The packaged index with a handful of looked-up POIs laid over it, still synchronous so the
 * gate can call it five times per envelope. The base answers first; an id it does not know is
 * answered from the extra layer, which is an ordinary `JsonPlaceIndex`. Every rule — the
 * business tag set, the residential set, Levenshtein and the phone normaliser — is that
 * index's, so a POI fetched a minute ago is judged exactly as one packaged a week ago.
 */
export class LayeredPlaceIndex implements PlaceIndex {
  private readonly base: PlaceIndex;
  private readonly extra: JsonPlaceIndex;

  constructor(base: PlaceIndex, extra: Poi[]) {
    this.base = base;
    const layer: PlaceExtract = {
      region: LIVE_REGION,
      generated_at: new Date().toISOString(),
      // ODbL: the licence follows the data onto this layer too.
      attribution: ATTRIBUTION,
      pois: extra,
    };
    this.extra = JsonPlaceIndex.fromJson(layer);
  }

  /** `resolve` on the base is the only question asked: it knows the id, or the extra layer does. */
  private layerFor(id: string): PlaceIndex {
    return this.base.resolve(id) !== undefined ? this.base : this.extra;
  }

  resolve(id: string): Poi | undefined {
    return this.layerFor(id).resolve(id);
  }

  isBusiness(id: string): boolean {
    return this.layerFor(id).isBusiness(id);
  }

  isResidential(id: string): boolean {
    return this.layerFor(id).isResidential(id);
  }

  fuzzyMatch(id: string, name: string, street: string): { ok: boolean; nameDistance: number; streetOk: boolean } {
    return this.layerFor(id).fuzzyMatch(id, name, street);
  }

  phoneOf(id: string): string | undefined {
    return this.layerFor(id).phoneOf(id);
  }

  coordinateOf(id: string): { lat: number; lon: number } | undefined {
    return this.layerFor(id).coordinateOf(id);
  }
}

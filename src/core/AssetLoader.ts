import { TMXMap, MapObject, TileProperties } from '../types';

export function resolveAssetUrl(path: string): string {
  if (!path || path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }
  const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL)
    ? import.meta.env.BASE_URL
    : './';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${cleanBase}${cleanPath}`;
}

export class AssetLoader {
  private images: Map<string, HTMLImageElement> = new Map();
  private maps: Map<string, TMXMap> = new Map();

  public async loadImage(path: string): Promise<HTMLImageElement> {
    if (this.images.has(path)) {
      return this.images.get(path)!;
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = resolveAssetUrl(path);
      img.onload = () => {
        this.images.set(path, img);
        resolve(img);
      };
      img.onerror = (err) => {
        console.error(`Failed to load image: ${path} (resolved: ${img.src})`, err);
        reject(err);
      };
    });
  }

  public getImage(path: string): HTMLImageElement | undefined {
    return this.images.get(path);
  }

  public async loadTMX(url: string): Promise<TMXMap> {
    if (this.maps.has(url)) {
      return this.maps.get(url)!;
    }

    const resolvedUrl = resolveAssetUrl(url);
    const response = await fetch(resolvedUrl);
    const xmlText = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');

    const mapElem = doc.querySelector('map');
    if (!mapElem) throw new Error(`Invalid TMX file at ${url}`);

    const width = parseInt(mapElem.getAttribute('width') || '0', 10);
    const height = parseInt(mapElem.getAttribute('height') || '0', 10);
    const tileWidth = parseInt(mapElem.getAttribute('tilewidth') || '76', 10);
    const tileHeight = parseInt(mapElem.getAttribute('tileheight') || '76', 10);

    // Tileset
    const tilesetElem = doc.querySelector('tileset');
    const tilesetName = tilesetElem?.getAttribute('name') || '';
    const imgElem = tilesetElem?.querySelector('image');
    let tilesetImageSource = imgElem?.getAttribute('source') || '';
    // Fix path to start with /
    if (tilesetImageSource.startsWith('assets/')) {
      tilesetImageSource = '/' + tilesetImageSource;
    }

    // Tile properties
    const tileProps = new Map<number, TileProperties>();
    const tileElems = tilesetElem ? Array.from(tilesetElem.querySelectorAll('tile')) : [];
    for (const tElem of tileElems) {
      const id = parseInt(tElem.getAttribute('id') || '-1', 10);
      if (id >= 0) {
        const props: TileProperties = {};
        const pElems = tElem.querySelectorAll('property');
        pElems.forEach((p) => {
          const name = p.getAttribute('name');
          const value = p.getAttribute('value');
          if (name === 'pHard') props.pHard = value === 'true';
          if (name === 'pPlatform' || name === 'pPlaftorm') props.pPlatform = value === 'true';
          if (name === 'pKilling') props.pKilling = value === 'true';
          if (name === 'pLadder') props.pLadder = value === 'true';
          if (name === 'pLadderEnd') props.pLadderEnd = value === 'true';
        });
        tileProps.set(id, props);
      }
    }

    // Tile Layer: find "Capa 0" or "data0" (not "REF")
    const layers = Array.from(doc.querySelectorAll('layer'));
    const gameLayer = layers.find((l) => l.getAttribute('name') !== 'REF') || layers[0];
    const dataElem = gameLayer.querySelector('data');
    if (!dataElem || !dataElem.textContent) {
      throw new Error(`No tile data found in ${url}`);
    }

    const b64 = dataElem.textContent.trim().replace(/\s+/g, '');
    const binary = atob(b64);
    const buffer = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const tiles = new Uint32Array(buffer);

    // Object Group
    const objects: MapObject[] = [];
    const objGroup = doc.querySelector('objectgroup');
    if (objGroup) {
      const objElems = Array.from(objGroup.querySelectorAll('object'));
      for (const obj of objElems) {
        const name = obj.getAttribute('name') || '';
        const type = obj.getAttribute('type') || '';
        const x = parseFloat(obj.getAttribute('x') || '0');
        const y = parseFloat(obj.getAttribute('y') || '0');
        const w = parseFloat(obj.getAttribute('width') || '0');
        const h = parseFloat(obj.getAttribute('height') || '0');

        const properties: Record<string, string> = {};
        const pElems = obj.querySelectorAll('property');
        pElems.forEach((p) => {
          const pname = p.getAttribute('name');
          const pval = p.getAttribute('value') || '';
          if (pname) {
            properties[pname] = pval;
          }
        });

        objects.push({ name, type, x, y, width: w, height: h, properties });
      }
    }

    // Map level and layer level properties (e.g. pMeteorite(x,y), pMeteorites, etc.)
    const mapProperties: Record<string, string> = {};
    const propElems = Array.from(doc.querySelectorAll('map > properties > property, layer > properties > property'));
    propElems.forEach((p) => {
      const pname = p.getAttribute('name');
      const pval = p.getAttribute('value') || '';
      if (pname) {
        mapProperties[pname] = pval;
      }
    });

    const mapData: TMXMap = {
      width,
      height,
      tileWidth,
      tileHeight,
      tilesetName,
      tilesetImageSource,
      tileProps,
      tiles,
      objects,
      properties: mapProperties,
    };

    this.maps.set(url, mapData);
    return mapData;
  }

  public getMap(url: string): TMXMap | undefined {
    return this.maps.get(url);
  }
}

export const assets = new AssetLoader();

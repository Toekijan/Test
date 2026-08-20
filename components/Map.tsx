"use client";

import { MapContainer, TileLayer, WMSTileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import type { Adreslocatie } from "@/types/domain";

const ACHTERGRONDKAART_URL =
  "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png";

// Publieke, key-loze WMS van ruimtelijkeplannen.nl / PDOK. Layernaam en pad kunnen per
// GetCapabilities afwijken; verifieer bij twijfel via
// https://www.pdok.nl/ogc-webservices/-/article/ruimtelijke-plannen
const RUIMTELIJKEPLANNEN_WMS_URL =
  process.env.NEXT_PUBLIC_RP_WMS_URL ?? "https://service.pdok.nl/kadaster/ruimtelijkeplannen/wms/v1_0";
const RUIMTELIJKEPLANNEN_WMS_LAYER = process.env.NEXT_PUBLIC_RP_WMS_LAYER ?? "Bestemmingsplangebied";

const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export default function Map({ adres }: { adres: Adreslocatie }) {
  return (
    <MapContainer center={[adres.lat, adres.lon]} zoom={17} key={`${adres.lat}-${adres.lon}`}>
      <TileLayer
        url={ACHTERGRONDKAART_URL}
        attribution='Kaartgegevens: &copy; <a href="https://www.pdok.nl">PDOK / Kadaster</a>'
        maxZoom={19}
      />
      <WMSTileLayer
        url={RUIMTELIJKEPLANNEN_WMS_URL}
        layers={RUIMTELIJKEPLANNEN_WMS_LAYER}
        format="image/png"
        transparent
        opacity={0.5}
      />
      <Marker position={[adres.lat, adres.lon]} icon={markerIcon}>
        <Popup>{adres.weergavenaam}</Popup>
      </Marker>
    </MapContainer>
  );
}

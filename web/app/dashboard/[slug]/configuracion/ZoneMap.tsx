'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix default marker icon path broken by webpack bundling
// (Leaflet looks for images in _next/static which doesn't have them)
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)['_getIconUrl']
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

export interface ZoneMapZone {
  delivery_zone_id: number
  zone_name:        string
  lat_center:       number | null
  lng_center:       number | null
  radius_km:        number | null
  is_active:        boolean
}

interface Props {
  lat:       number | null
  lng:       number | null
  radiusKm:  number
  zones:     ZoneMapZone[]
  accent:    string
  onChange:  (lat: number, lng: number) => void
}

export default function ZoneMap({ lat, lng, radiusKm, zones, accent, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<L.Map | null>(null)
  const markerRef    = useRef<L.Marker | null>(null)
  const circleRef    = useRef<L.Circle | null>(null)
  const zoneLayersRef = useRef<L.Layer[]>([])

  // Default center: Canary Islands (La Isla Pizzería context) or provided coords
  const center: [number, number] = lat != null && lng != null ? [lat, lng] : [28.0997, -15.4134]

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center,
      zoom: lat != null ? 13 : 9,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)

    mapRef.current = map

    // Click to reposition
    map.on('click', (e: L.LeafletMouseEvent) => {
      onChange(e.latlng.lat, e.latlng.lng)
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update restaurant marker + coverage circle when lat/lng/radius change
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (markerRef.current) markerRef.current.remove()
    if (circleRef.current) circleRef.current.remove()

    if (lat == null || lng == null) return

    const marker = L.marker([lat, lng], { draggable: true })
      .addTo(map)
      .bindPopup('<b>Local</b><br>Arrastra para reposicionar')

    marker.on('dragend', () => {
      const { lat: newLat, lng: newLng } = marker.getLatLng()
      onChange(newLat, newLng)
    })

    const circle = L.circle([lat, lng], {
      radius:      radiusKm * 1000,
      color:       accent,
      fillColor:   accent,
      fillOpacity: 0.08,
      weight:      2,
    }).addTo(map)

    markerRef.current = marker
    circleRef.current = circle

    map.setView([lat, lng], map.getZoom())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, radiusKm, accent])

  // Render delivery zone circles
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    zoneLayersRef.current.forEach(l => l.remove())
    zoneLayersRef.current = []

    zones.forEach(z => {
      if (z.lat_center == null || z.lng_center == null || z.radius_km == null) return
      const color = z.is_active ? '#10B981' : '#9CA3AF'
      const layer = L.circle([z.lat_center, z.lng_center], {
        radius:      z.radius_km * 1000,
        color,
        fillColor:   color,
        fillOpacity: 0.12,
        weight:      1.5,
        dashArray:   '4 4',
      }).addTo(map).bindPopup(`<b>${z.zone_name}</b><br>${z.radius_km} km`)
      zoneLayersRef.current.push(layer)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones])

  return (
    <div
      ref={containerRef}
      style={{ height: 320, width: '100%', borderRadius: 12, overflow: 'hidden', zIndex: 0 }}
    />
  )
}

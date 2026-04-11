"""
Reverse Geocoding Utility
Converts GPS coordinates (lat, lng) to structured address using OpenStreetMap Nominatim.
"""

import httpx
import logging

logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"


async def reverse_geocode(latitude: float, longitude: float) -> dict:
    """
    Converts GPS coordinates to a structured address.
    Returns dict with keys: pincode, city, area, state, display_name
    Falls back gracefully if geocoding fails.
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                NOMINATIM_URL,
                params={
                    "lat": latitude,
                    "lon": longitude,
                    "format": "json",
                    "addressdetails": 1,
                    "zoom": 16,
                },
                headers={
                    "User-Agent": "SmartAllocator/1.0 (NGO Resource Allocation App)"
                },
                timeout=10.0,
            )
            response.raise_for_status()
            data = response.json()

        address = data.get("address", {})

        result = {
            "pincode": address.get("postcode", ""),
            "city": (
                address.get("city")
                or address.get("town")
                or address.get("village")
                or address.get("county")
                or ""
            ),
            "area": (
                address.get("suburb")
                or address.get("neighbourhood")
                or address.get("quarter")
                or ""
            ),
            "state": address.get("state", ""),
            "country": address.get("country", ""),
            "display_name": data.get("display_name", ""),
        }

        logger.info(f"Geocoded ({latitude}, {longitude}) → {result['area']}, {result['city']} - {result['pincode']}")
        return result

    except httpx.HTTPStatusError as e:
        logger.error(f"Geocoding HTTP error: {e.response.status_code}")
        return _empty_result()
    except httpx.RequestError as e:
        logger.error(f"Geocoding request error: {e}")
        return _empty_result()
    except Exception as e:
        logger.error(f"Geocoding unexpected error: {e}")
        return _empty_result()


def _empty_result() -> dict:
    return {
        "pincode": "",
        "city": "",
        "area": "",
        "state": "",
        "country": "",
        "display_name": "",
    }


def get_radius_km_for_urgency(urgency: int) -> float:
    """
    Returns search radius in km based on issue urgency (1-10 scale).
    Higher urgency → larger radius to find more volunteers.
    
    Urgency 1-3: 5km (local neighborhood)
    Urgency 4-5: 15km (across town)
    Urgency 6-7: 30km (city-wide)
    Urgency 8-9: 60km (metro area)
    Urgency 10:  100km (nearby cities)
    """
    if urgency <= 3:
        return 5.0
    elif urgency <= 5:
        return 15.0
    elif urgency <= 7:
        return 30.0
    elif urgency <= 9:
        return 60.0
    else:
        return 100.0

"""
Reverse Geocoding Utility
Converts GPS coordinates (lat, lng) to structured address using OpenStreetMap Nominatim.
"""

import httpx
import logging

logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"


async def forward_geocode(landmark: str = "", city: str = "", district: str = "", state: str = "", pincode: str = "") -> dict:
    """
    Converts address components to GPS coordinates using structured search.
    """
    params = {
        "format": "json",
        "limit": 1,
        "addressdetails": 1,
    }
    
    # Use structured parameters for better accuracy
    if pincode:
        params["postalcode"] = pincode
    if city:
        params["city"] = city
    if district:
        # Many Indian districts match 'county' in Nominatim
        params["county"] = district
    if state:
        params["state"] = state
    
    query_parts = [p for p in [landmark, district, city, state, pincode] if p]
    query = ", ".join(query_parts)

    try:
        async with httpx.AsyncClient() as client:
            # Try structured first if we have enough info
            if pincode or city or district or state:
                response = await client.get(NOMINATIM_SEARCH_URL, params=params, headers={"User-Agent": "SmartAllocator/1.0"}, timeout=10.0)
                response.raise_for_status()
                data = response.json()
            else:
                data = []
            
            # If structured fails or is too sparse, try general query
            if not data:
                response = await client.get(NOMINATIM_SEARCH_URL, params={"q": query, "format": "json", "limit": 1, "addressdetails": 1}, headers={"User-Agent": "SmartAllocator/1.0"}, timeout=10.0)
                data = response.json()

        if not data:
            logger.warning(f"Geocoding: No results found for {params} or {query}")
            return {"success": False}

        best_match = data[0]
        address = best_match.get("address", {})
        
        # Check if the result is actually in the expected state if provided (loose match)
        res_state = (address.get("state") or "").lower()
        req_state = (state or "").lower()
        if req_state and res_state and req_state not in res_state:
            # If there's a clear state mismatch, it's likely a wrong geocode (e.g. Patna vs Kerala)
            # But only reject if both are explicitly present
            logger.warning(f"Geocoding: State mismatch. Expected {req_state}, got {res_state}. Ignoring result.")
            return {"success": False}

        return {
            "success": True,
            "latitude": float(best_match["lat"]),
            "longitude": float(best_match["lon"]),
            "pincode": address.get("postcode") or pincode,
            "city": address.get("city") or address.get("town") or address.get("village") or "",
            "area": address.get("suburb") or address.get("neighbourhood") or "",
            "state": address.get("state", ""),
        }
    except Exception as e:
        logger.error(f"Forward geocoding error: {e}")
        return {"success": False}


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


async def forward_geocode(landmark: str, city: str, district: str, state: str, pincode: str) -> dict:
    """
    Forward geocodes address components to GPS coordinates with multi-level fallback.
    """
    SEARCH_URL = "https://nominatim.openstreetmap.org/search"
    
    # Try multiple queries from most specific to least specific
    queries = [
        ", ".join([p for p in [landmark, district, state, pincode, "India"] if p]),
        ", ".join([p for p in [district, state, pincode, "India"] if p]),
        ", ".join([p for p in [pincode, "India"] if p])
    ]

    for query in queries:
        if not query or query == "India": continue
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    SEARCH_URL,
                    params={"q": query, "format": "json", "limit": 1, "addressdetails": 1},
                    headers={"User-Agent": "SmartAllocator/1.0"},
                    timeout=10.0,
                )
                response.raise_for_status()
                results = response.json()
                
                if results:
                    data = results[0]
                    address = data.get("address", {})
                    logger.info(f"[FORWARD GEO] Success with query '{query}'")
                    return {
                        "latitude": float(data["lat"]),
                        "longitude": float(data["lon"]),
                        "pincode": address.get("postcode", pincode),
                        "city": address.get("city") or address.get("town") or address.get("village") or city,
                        "area": address.get("suburb") or address.get("neighbourhood") or district or landmark,
                        "state": address.get("state", state),
                        "success": True
                    }
        except Exception as e:
            logger.error(f"Forward geocoding attempt failed for '{query}': {e}")
    
    return {"success": False}


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

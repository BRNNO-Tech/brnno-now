import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getSavedAddresses, type SavedAddress } from '../lib/savedAddresses';
import { getDetailerByAuthUserId } from '../services/detailers';

type LandingAddress = {
  address: string;
  zip: string | null;
  lat: number | null;
  lng: number | null;
};

type RecentAddress = { address: string; zip: string | null };

const RECENTS_KEY = 'brnno_recent_addresses_v1';
const RECENTS_LIMIT = 2;

function loadRecents(): RecentAddress[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is RecentAddress => !!x && typeof (x as { address?: unknown }).address === 'string')
      .slice(0, RECENTS_LIMIT);
  } catch {
    return [];
  }
}

function saveRecent(next: RecentAddress) {
  try {
    const prev = loadRecents();
    const merged = [next, ...prev.filter((p) => p.address !== next.address)].slice(0, RECENTS_LIMIT);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(merged));
  } catch {
    // ignore
  }
}

function getGoogleMapsApiKey(): string {
  const viteKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? '';
  const nonPrefixKey = (import.meta.env.GOOGLE_MAPS_API_KEY as string | undefined) ?? '';
  const raw = (viteKey || nonPrefixKey).trim();
  return raw.replace(/^["']|["']$/g, '').trim();
}

async function ensureGooglePlacesLoaded(): Promise<void> {
  if (typeof window === 'undefined') return;
  if ((window as any).google?.maps?.places) return;

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey || apiKey.includes('YOUR_GOOGLE_MAPS')) return;

  const existing = document.querySelector('script[data-brnno-google-maps="1"]') as HTMLScriptElement | null;
  if (existing) {
    await new Promise<void>((resolve) => {
      const id = setInterval(() => {
        if ((window as any).google?.maps?.places) {
          clearInterval(id);
          resolve();
        }
      }, 120);
      setTimeout(() => {
        clearInterval(id);
        resolve();
      }, 12000);
    });
    return;
  }

  await new Promise<void>((resolve) => {
    const script = document.createElement('script');
    script.dataset.brnnoGoogleMaps = '1';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

export default function LandingScreen({
  onOpenProfile,
  onContinue,
}: {
  onOpenProfile: () => void;
  onContinue: (address: { address: string; zip: string | null }) => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [placesReady, setPlacesReady] = useState(false);
  const autocompleteServiceRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);

  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<any[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [recentAddresses, setRecentAddresses] = useState<RecentAddress[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [selected, setSelected] = useState<LandingAddress | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await ensureGooglePlacesLoaded();
      if (cancelled) return;
      if ((window as any).google?.maps?.places) {
        autocompleteServiceRef.current = new (window as any).google.maps.places.AutocompleteService();
        geocoderRef.current = new (window as any).google.maps.Geocoder();
        setPlacesReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setSavedAddresses([]);
      setRecentAddresses(loadRecents());
      return;
    }
    getSavedAddresses(user.id)
      .then(setSavedAddresses)
      .catch(() => setSavedAddresses([]));
  }, [user?.id]);

  useEffect(() => {
    if (!query.trim() || !autocompleteServiceRef.current || !(window as any).google?.maps?.places) {
      setPredictions([]);
      return;
    }
    autocompleteServiceRef.current.getPlacePredictions(
      { input: query, types: ['address'], componentRestrictions: { country: 'us' } },
      (results, status) => {
        if (status === (window as any).google.maps.places.PlacesServiceStatus.OK && results) setPredictions(results);
        else setPredictions([]);
      }
    );
  }, [query, placesReady]);

  const pickAddress = useCallback(
    (addr: LandingAddress) => {
      setSelected(addr);
      setQuery(addr.address);
      setDropdownOpen(false);
      if (!user?.id) {
        saveRecent({ address: addr.address, zip: addr.zip });
        setRecentAddresses(loadRecents());
      }
    },
    [user?.id]
  );

  const resolvePrediction = useCallback(
    (prediction: any) => {
      if (!geocoderRef.current) {
        pickAddress({ address: prediction.description, zip: null, lat: null, lng: null });
        return;
      }
      geocoderRef.current.geocode({ placeId: prediction.place_id }, (results, status) => {
        if (status === 'OK' && results?.[0]) {
          const r = results[0];
          const lat = r.geometry.location.lat();
          const lng = r.geometry.location.lng();
          const zip = r.address_components?.find((c) => c.types.includes('postal_code'))?.short_name ?? null;
          pickAddress({ address: prediction.description, zip, lat, lng });
        } else {
          pickAddress({ address: prediction.description, zip: null, lat: null, lng: null });
        }
      });
      setPredictions([]);
    },
    [pickAddress]
  );

  const canContinue = !!selected?.address?.trim();

  const openSidebarAuth = useCallback(
    (mode: 'login' | 'signup') => {
      onOpenProfile();
      // Reuse the existing sidebar auth UI by toggling its built-in switch button.
      // We can't change ProfileSidebar internals, so we click the toggle by label.
      window.setTimeout(() => {
        const allButtons = Array.from(document.querySelectorAll('button'));
        const toggleToSignUp = allButtons.find((b) => (b.textContent ?? '').trim() === 'Create an account');
        const toggleToLogin = allButtons.find((b) => (b.textContent ?? '').trim() === 'Already have an account? Sign in');

        if (mode === 'signup' && toggleToSignUp) toggleToSignUp.click();
        if (mode === 'login' && toggleToLogin) toggleToLogin.click();
      }, 0);
    },
    [onOpenProfile]
  );

  const rightTop = useMemo(() => {
    if (!user) {
      return (
        <button
          type="button"
          onClick={() => openSidebarAuth('login')}
          className="pointer-events-auto px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-white text-sm font-bold hover:bg-white/10 active:scale-95 transition-transform"
        >
          Log in
        </button>
      );
    }
    const name = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? '';
    const display = name ? name.split(' ')[0] : 'Profile';
    return (
      <button
        type="button"
        onClick={onOpenProfile}
        className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white text-sm font-bold hover:bg-white/10 active:scale-95 transition-transform max-w-[140px]"
        title={name || undefined}
      >
        <span className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.121 17.804A9 9 0 1118.88 6.196 9 9 0 015.12 17.804z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 20a7 7 0 0110 0" />
          </svg>
        </span>
        <span className="truncate">{display}</span>
      </button>
    );
  }, [onOpenProfile, user]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const d = await getDetailerByAuthUserId(user.id);
        if (cancelled) return;
        if (d) navigate('/detailer/dashboard', { replace: true });
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, user?.id]);

  return (
    <div className="relative h-screen w-full overflow-hidden select-none" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="absolute top-0 left-0 right-0 z-40 p-4 flex justify-between items-center pointer-events-none">
        <div className="w-12 h-12" aria-hidden="true" />

        <div className="px-6 py-2 rounded-2xl shadow-lg flex items-center gap-2 border border-white/10 bg-white/5">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="font-black text-sm tracking-tighter text-white">BRNNO NOW</span>
        </div>

        {rightTop}
      </div>

      <div className="h-full w-full flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.35em] mb-4" style={{ color: '#F2C94C' }}>
            Mobile Auto Detailing
          </p>

          <div className="leading-none mb-10" style={{ fontFamily: "'Barlow Condensed', system-ui, sans-serif" }}>
            <div className="text-6xl font-bold tracking-tight text-white">BRNNO</div>
            <div className="text-6xl font-light tracking-tight text-gray-500 -mt-1">NOW</div>
          </div>

          <div className="relative mb-3">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onFocus={() => setDropdownOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setDropdownOpen(true);
                setSelected(null);
                setLocationError(null);
              }}
              placeholder="Where should we come to you?"
              className="w-full rounded-2xl pl-10 pr-4 py-4 text-sm font-semibold text-white placeholder:text-gray-500 focus:outline-none border border-white/10 bg-white/5"
              autoComplete="off"
            />
          </div>

          {dropdownOpen && (
            <div className="mb-6 rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
              <button
                type="button"
                disabled={locationLoading}
                onClick={() => {
                  setLocationError(null);
                  if (typeof window !== 'undefined' && !window.isSecureContext) {
                    setLocationError(
                      'Location needs https:// or http://localhost. You can also search your address above.'
                    );
                    return;
                  }
                  if (!navigator.geolocation) {
                    setLocationError('Your browser does not support location.');
                    return;
                  }
                    if (!geocoderRef.current && (window as any).google?.maps) {
                      geocoderRef.current = new (window as any).google.maps.Geocoder();
                  }

                  const finish = (lat: number, lng: number) => {
                    if (geocoderRef.current) {
                      geocoderRef.current.geocode({ location: { lat, lng } }, (results, status) => {
                        setLocationLoading(false);
                        if (status === 'OK' && results?.[0]) {
                          const addr = results[0].formatted_address;
                          const zip =
                            results[0].address_components?.find((c) => c.types.includes('postal_code'))?.short_name ?? null;
                          pickAddress({ address: addr, zip, lat, lng });
                        } else {
                          pickAddress({ address: 'Current location', zip: null, lat, lng });
                        }
                      });
                    } else {
                      setLocationLoading(false);
                      pickAddress({ address: 'Current location', zip: null, lat, lng });
                    }
                  };

                  const onErr = (err: GeolocationPositionError) => {
                    setLocationLoading(false);
                    const msg =
                      err.code === err.PERMISSION_DENIED
                        ? 'Location permission blocked. Check site settings for this page and try again.'
                        : err.code === err.POSITION_UNAVAILABLE
                          ? 'Could not read your position. Try again or enter your address.'
                          : err.code === err.TIMEOUT
                            ? 'Location timed out. Try again or enter your address.'
                            : 'Could not get your location. Try again or search your address above.';
                    setLocationError(msg);
                  };

                  setLocationLoading(true);
                  navigator.geolocation.getCurrentPosition(
                    (pos) => finish(pos.coords.latitude, pos.coords.longitude),
                    onErr,
                    { enableHighAccuracy: false, maximumAge: 60000, timeout: 20000 }
                  );
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 0v4m0 12v4M2 12h4m12 0h4" />
                </svg>
                <span className="text-sm font-bold text-gray-200">{locationLoading ? 'Getting location…' : 'Use my current location'}</span>
              </button>

              {locationError && (
                <div className="px-4 pb-3">
                  <p className="text-xs font-semibold text-red-300" role="alert">
                    {locationError}
                  </p>
                </div>
              )}

              {predictions.length > 0 && (
                <div className="border-t border-white/10">
                  {predictions.map((p) => (
                    <button
                      key={p.place_id}
                      type="button"
                      onClick={() => resolvePrediction(p)}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 border-b border-white/10 last:border-0 transition-colors"
                    >
                      <p className="text-sm font-bold text-gray-100 truncate">{p.structured_formatting.main_text}</p>
                      <p className="text-xs text-gray-400 truncate">{p.structured_formatting.secondary_text}</p>
                    </button>
                  ))}
                </div>
              )}

              {predictions.length === 0 && (user?.id ? savedAddresses.length > 0 : recentAddresses.length > 0) && (
                <div className="border-t border-white/10">
                  {(user?.id ? savedAddresses : recentAddresses).map((item) => {
                    const address = 'address' in item ? item.address : item.address;
                    const zip = 'address_zip' in item ? item.address_zip ?? null : item.zip ?? null;
                    const label = 'label' in item ? item.label : null;
                    return (
                      <button
                        key={label ? `${label}-${address}` : address}
                        type="button"
                        onClick={() => pickAddress({ address, zip, lat: null, lng: null })}
                        className="w-full text-left px-4 py-3 hover:bg-white/5 border-b border-white/10 last:border-0 transition-colors"
                      >
                        {label && <p className="text-xs font-black uppercase tracking-widest text-gray-500 mb-0.5">{label}</p>}
                        <p className="text-sm font-bold text-gray-100 truncate">{address}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={!canContinue}
            onClick={() => selected && onContinue({ address: selected.address, zip: selected.zip })}
            className="w-full py-5 rounded-2xl font-black text-base shadow-2xl active:scale-95 transition-transform flex items-center justify-between px-6 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#F2C94C', color: '#0a0a0a' }}
          >
            <span>BOOK HERE</span>
            <span className="text-2xl">→</span>
          </button>

        </div>
      </div>

      <div className="absolute bottom-2 left-0 right-0 flex justify-center pointer-events-none">
        <div className="w-36 h-1.5 rounded-full bg-white/15" />
      </div>
    </div>
  );
}


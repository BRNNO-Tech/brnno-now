import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSavedAddresses, addSavedAddress, deleteSavedAddress, type SavedAddress } from '../lib/savedAddresses';

interface AddressStepProps {
  user?: { id?: string } | null;
  onSelect: (address: string, addressZip: string | null, lat: number | null, lng: number | null) => void;
  onClose?: () => void;
}

declare global {
  interface Window {
    google?: typeof google;
  }
}

const AddressStep: React.FC<AddressStepProps> = ({ user, onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [savingCurrent, setSavingCurrent] = useState(false);
  const [saveLabel, setSaveLabel] = useState('');
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [pendingSave, setPendingSave] = useState<{ address: string; zip: string | null; lat: number | null; lng: number | null } | null>(null);
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const geocoder = useRef<google.maps.Geocoder | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Init Google services
  useEffect(() => {
    if (window.google?.maps?.places) {
      autocompleteService.current = new window.google.maps.places.AutocompleteService();
      geocoder.current = new window.google.maps.Geocoder();
    }
  }, []);

  // Load saved addresses for logged-in users
  useEffect(() => {
    if (!user?.id) return;
    setLoadingSaved(true);
    getSavedAddresses(user.id)
      .then(setSavedAddresses)
      .catch(() => setSavedAddresses([]))
      .finally(() => setLoadingSaved(false));
  }, [user?.id]);

  // Autocomplete
  useEffect(() => {
    if (!query.trim() || !autocompleteService.current) {
      setPredictions([]);
      return;
    }
    autocompleteService.current.getPlacePredictions(
      { input: query, types: ['address'], componentRestrictions: { country: 'us' } },
      (results, status) => {
        if (status === window.google!.maps.places.PlacesServiceStatus.OK && results) {
          setPredictions(results);
        } else {
          setPredictions([]);
        }
      }
    );
  }, [query]);

  const resolveAndSelect = useCallback(
    (address: string, zip: string | null, lat: number | null, lng: number | null) => {
      if (user?.id) {
        // Offer to save
        setPendingSave({ address, zip, lat, lng });
        setShowSavePrompt(true);
      } else {
        onSelect(address, zip, lat, lng);
      }
    },
    [user?.id, onSelect]
  );

  const handlePredictionSelect = (prediction: google.maps.places.AutocompletePrediction) => {
    if (!geocoder.current) {
      resolveAndSelect(prediction.description, null, null, null);
      return;
    }
    geocoder.current.geocode({ placeId: prediction.place_id }, (results, status) => {
      if (status === 'OK' && results?.[0]) {
        const result = results[0];
        const lat = result.geometry.location.lat();
        const lng = result.geometry.location.lng();
        const zip =
          result.address_components?.find((c) => c.types.includes('postal_code'))?.short_name ?? null;
        resolveAndSelect(prediction.description, zip, lat, lng);
      } else {
        resolveAndSelect(prediction.description, null, null, null);
      }
    });
    setPredictions([]);
    setQuery('');
  };

  const handleSavedSelect = (saved: SavedAddress) => {
    onSelect(saved.address, saved.address_zip ?? null, saved.lat ?? null, saved.lng ?? null);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSavedAddress(id);
      setSavedAddresses((prev) => prev.filter((a) => a.id !== id));
    } catch {
      // ignore
    }
  };

  const handleSaveConfirm = async () => {
    if (!pendingSave || !user?.id) {
      if (pendingSave) onSelect(pendingSave.address, pendingSave.zip, pendingSave.lat, pendingSave.lng);
      setShowSavePrompt(false);
      return;
    }
    if (saveLabel.trim()) {
      setSavingCurrent(true);
      try {
        await addSavedAddress(user.id, {
          label: saveLabel.trim(),
          address: pendingSave.address,
          address_zip: pendingSave.zip,
          lat: pendingSave.lat,
          lng: pendingSave.lng,
        });
      } catch {
        // ignore save failure, still proceed
      } finally {
        setSavingCurrent(false);
      }
    }
    onSelect(pendingSave.address, pendingSave.zip, pendingSave.lat, pendingSave.lng);
    setShowSavePrompt(false);
    setPendingSave(null);
    setSaveLabel('');
  };

  // Save prompt overlay
  if (showSavePrompt && pendingSave) {
    return (
      <div className="absolute bottom-0 left-0 right-0 p-4 z-30 max-h-[90vh] flex flex-col">
        <div className="glass rounded-3xl shadow-2xl overflow-hidden max-w-md mx-auto border border-white/40 flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
          <div className="p-6">
            <h3 className="font-bold text-xl mb-1">Save this address?</h3>
            <p className="text-sm text-gray-500 mb-4 truncate">{pendingSave.address}</p>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2 mb-1">Label (optional)</label>
            <input
              type="text"
              value={saveLabel}
              onChange={(e) => setSaveLabel(e.target.value)}
              placeholder="e.g. Home, Work, Apartment"
              className="w-full bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-black mb-4"
            />
            <button
              type="button"
              onClick={handleSaveConfirm}
              disabled={savingCurrent}
              className="w-full bg-black text-white py-4 rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-transform disabled:opacity-50 mb-3"
            >
              {savingCurrent ? 'Saving…' : saveLabel.trim() ? 'Save & Continue' : 'Continue without saving'}
            </button>
            <button
              type="button"
              onClick={() => {
                onSelect(pendingSave.address, pendingSave.zip, pendingSave.lat, pendingSave.lng);
                setShowSavePrompt(false);
                setPendingSave(null);
              }}
              className="w-full text-gray-500 text-sm font-bold"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 p-4 z-30 max-h-[90vh] flex flex-col">
      <div
        className="glass rounded-3xl shadow-2xl overflow-hidden max-w-md mx-auto border border-white/40 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 p-6 pb-2">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-xl">Where should we detail?</h3>
            {onClose && (
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors active:scale-90"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-6 pt-2">
          {/* Search bar */}
          <div className="relative mb-4">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search address…"
              className="w-full bg-white border-2 border-gray-100 rounded-2xl pl-10 pr-4 py-3 text-sm font-medium focus:outline-none focus:border-black"
              autoComplete="off"
            />
          </div>

          {/* Autocomplete predictions */}
          {predictions.length > 0 && (
            <div className="mb-4 bg-white rounded-2xl border-2 border-gray-100 overflow-hidden">
              {predictions.map((p) => (
                <button
                  key={p.place_id}
                  type="button"
                  onClick={() => handlePredictionSelect(p)}
                  className="w-full text-left px-4 py-3 text-sm font-medium hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors"
                >
                  <p className="font-bold text-gray-900 truncate">{p.structured_formatting.main_text}</p>
                  <p className="text-gray-500 text-xs truncate">{p.structured_formatting.secondary_text}</p>
                </button>
              ))}
            </div>
          )}

          {/* Saved addresses — logged in only */}
          {user?.id && (
            <div className="mb-4">
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-2">Saved addresses</h4>
              {loadingSaved ? (
                <p className="text-sm text-gray-400 ml-2">Loading…</p>
              ) : savedAddresses.length === 0 ? (
                <p className="text-sm text-gray-400 ml-2">No saved addresses yet. Search above to add one.</p>
              ) : (
                <div className="space-y-2">
                  {savedAddresses.map((saved) => (
                    <div key={saved.id} className="flex items-center gap-2 bg-white border-2 border-gray-100 rounded-2xl px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleSavedSelect(saved)}
                        className="flex-1 text-left"
                      >
                        <p className="font-bold text-sm text-gray-900">{saved.label}</p>
                        <p className="text-xs text-gray-500 truncate">{saved.address}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(saved.id)}
                        className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                        aria-label="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Use current location (optional, user-initiated) */}
          <button
            type="button"
            onClick={() => {
              if (!navigator.geolocation) return;
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  const { latitude: lat, longitude: lng } = pos.coords;
                  if (geocoder.current) {
                    geocoder.current.geocode({ location: { lat, lng } }, (results, status) => {
                      if (status === 'OK' && results?.[0]) {
                        const address = results[0].formatted_address;
                        const zip = results[0].address_components?.find((c) => c.types.includes('postal_code'))?.short_name ?? null;
                        resolveAndSelect(address, zip, lat, lng);
                      } else {
                        resolveAndSelect('Current location', null, lat, lng);
                      }
                    });
                  } else {
                    resolveAndSelect('Current location', null, lat, lng);
                  }
                },
                () => {} // user denied, do nothing
              );
            }}
            className="w-full flex items-center gap-3 bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-bold text-gray-700 hover:border-gray-200 transition-colors"
          >
            <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 0v4m0 12v4M2 12h4m12 0h4" />
            </svg>
            Use my current location
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddressStep;

import React, { useEffect, useState, useRef } from 'react';
import { getServicePrice } from '../constants';
import { BookingStatus, Detailer, Service, VehicleInfo, vehicleDisplayString } from '../types';

interface ActiveBookingProps {
  status: BookingStatus;
  detailer: Detailer;
  service: Service;
  vehicleInfo?: VehicleInfo | null;
  onCancel: () => void;
  onComplete?: () => void;
}

interface Message {
  id: string;
  sender: 'user' | 'detailer';
  text: string;
  time: string;
}

const ActiveBooking: React.FC<ActiveBookingProps> = ({ status, detailer, service, vehicleInfo, onCancel, onComplete }) => {
  const displayPrice = getServicePrice(service.id, vehicleInfo?.size ?? 'sedan');
  const [eta, setEta] = useState(8);
  const [highlight, setHighlight] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showArrivedBanner, setShowArrivedBanner] = useState(false);
  
  // Chat state
  const [showChat, setShowChat] = useState(false);
  const [showManageBooking, setShowManageBooking] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { 
      id: '1', 
      sender: 'detailer', 
      text: `Hi, I'm ${detailer.name}! I'm en route to your location.`, 
      time: 'Just now' 
    }
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setEta(prev => Math.max(1, prev - 1));
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Trigger arrival banner and highlights
  useEffect(() => {
    setHighlight(true);
    const timeout = setTimeout(() => setHighlight(false), 3000);
    
    if (status === BookingStatus.ARRIVED) {
      setShowArrivedBanner(true);
    } else {
      setShowArrivedBanner(false);
    }

    return () => clearTimeout(timeout);
  }, [status]);

  // Scroll to bottom of chat
  useEffect(() => {
    if (showChat) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showChat]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: chatMessage,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, newMessage]);
    setChatMessage('');

    // Simulate detailer reply
    setTimeout(() => {
      const reply: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'detailer',
        text: "Got it! Thanks for the update.",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, reply]);
    }, 2500);
  };

  const getStatusText = () => {
    switch (status) {
      case BookingStatus.EN_ROUTE: return `Arriving in ${eta} mins`;
      case BookingStatus.ARRIVED: return 'Your Pro has arrived!';
      case BookingStatus.IN_PROGRESS: return 'Detailing in progress...';
      default: return 'Preparing...';
    }
  };

  const isArrived = status === BookingStatus.ARRIVED;

  return (
    <>
      {/* Prominent Arrival Banner */}
      <div 
        className={`fixed top-0 left-0 right-0 z-[60] p-4 transition-all duration-700 ease-in-out transform ${
          showArrivedBanner ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="max-w-md mx-auto bg-black text-white rounded-[28px] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/10 flex items-center gap-4 animate-bounce-subtle">
          <div className="w-14 h-14 bg-green-500 rounded-2xl flex items-center justify-center flex-shrink-0 animate-pulse">
            <svg className="w-8 h-8 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="flex-grow">
            <h4 className="text-xl font-black uppercase tracking-tight leading-none text-green-400">Pro is Here</h4>
            <p className="text-sm font-bold opacity-70 mt-1">{detailer.name} has arrived at your location.</p>
          </div>
          <button 
            onClick={() => setShowArrivedBanner(false)}
            className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 z-30">
        <div className="glass rounded-3xl shadow-2xl overflow-hidden max-w-md mx-auto border border-white/50">
          <div className="p-6">
            <div className="flex justify-between items-start mb-6">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h3 className={`text-2xl font-black uppercase tracking-tight transition-all duration-500 ${isArrived ? 'text-green-600' : 'text-black'} ${highlight ? 'scale-105' : 'scale-100'}`}>
                    {getStatusText()}
                  </h3>
                  {isArrived && (
                    <span className="flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                  )}
                </div>
                <p className="text-gray-500 text-sm font-medium">{service.name} at Home</p>
              </div>
              <div className="bg-black text-white px-3 py-1 rounded-lg text-sm font-bold flex items-center gap-2">
                 <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                 LIVE
              </div>
            </div>

            <div className={`flex items-center gap-4 bg-gray-50 p-4 rounded-2xl border transition-all duration-700 ${
              highlight 
                ? isArrived ? 'border-green-400 bg-green-50/50 shadow-[0_0_20px_rgba(74,222,128,0.2)]' : 'border-blue-400 bg-blue-50/50 shadow-[0_0_20px_rgba(59,130,246,0.1)]'
                : 'border-gray-100'
            } mb-4`}>
              <div className="relative">
                <div className={`w-16 h-16 rounded-2xl overflow-hidden shadow-md transition-all duration-500 transform ${
                  highlight ? 'scale-110 rotate-2' : 'scale-100 rotate-0'
                } ${isArrived ? 'ring-4 ring-green-400 ring-offset-2' : 'ring-0'}`}>
                  <img src={detailer.avatar} alt={detailer.name} className="w-full h-full object-cover" />
                </div>
                {highlight && (
                  <div className="absolute inset-0 rounded-2xl animate-ping border-4 border-blue-400 opacity-20 pointer-events-none" />
                )}
              </div>
              
              <div className="flex-grow">
                <div className="flex justify-between items-center">
                  <h4 className={`font-bold text-lg transition-all duration-500 ${highlight ? 'translate-x-1 text-blue-600 scale-105' : 'translate-x-0 text-black scale-100'}`}>
                    {detailer.name}
                  </h4>
                  <div className="flex items-center gap-1 font-bold text-sm">
                    <span className="text-yellow-400">★</span> {detailer.rating}
                  </div>
                </div>
                <p className="text-xs text-gray-400 font-medium">Top Rated Professional</p>
                <div className="flex gap-2 mt-2">
                  <button 
                    onClick={() => setShowChat(true)}
                    className="flex-grow bg-white border border-gray-200 py-2 rounded-xl text-xs font-black uppercase tracking-tight hover:bg-black hover:text-white hover:border-black active:scale-95 transition-all"
                  >
                    Message
                  </button>
                  <button className="flex-grow bg-white border border-gray-200 py-2 rounded-xl text-xs font-black uppercase tracking-tight hover:bg-green-600 hover:text-white hover:border-green-600 active:scale-95 transition-all">
                    Call
                  </button>
                </div>
              </div>
            </div>

            {/* New Service Details & Vehicle Section */}
            <div className="bg-gray-50/80 rounded-2xl p-4 mb-6 border border-gray-100 space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-gray-200/50">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Service Item</span>
                <span className="text-xs font-black text-black">{service.name} • ${displayPrice}</span>
              </div>
              {vehicleInfo && vehicleDisplayString(vehicleInfo) && (
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Vehicle</span>
                  <span className="text-sm font-bold text-gray-800">{vehicleDisplayString(vehicleInfo)}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Expected Time</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">⏱️</span>
                    <span className="text-xs font-bold text-gray-700">{service.duration}</span>
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Pro Vehicle</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">🚐</span>
                    <span className="text-xs font-bold text-gray-700 truncate max-w-[100px]">{detailer.car}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
               <button 
                  onClick={() => setShowCancelConfirm(true)}
                  className="flex-shrink-0 w-14 h-14 bg-gray-100 flex items-center justify-center rounded-2xl hover:bg-red-50 hover:text-red-600 active:scale-90 transition-all group"
               >
                  <svg className="w-6 h-6 transition-transform group-hover:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
               </button>
               <button 
                 onClick={() => setShowManageBooking(true)}
                 className="flex-grow bg-black text-white rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-all hover:bg-gray-900"
               >
                  Manage Booking
               </button>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Interface Modal */}
      {showChat && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-white animate-in slide-in-from-bottom duration-300">
          {/* Header */}
          <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white shadow-lg">
                  <img src={detailer.avatar} alt={detailer.name} className="w-full h-full object-cover" />
                </div>
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
              </div>
              <div>
                <h3 className="font-black text-xl leading-tight tracking-tight">{detailer.name}</h3>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Detailing Pro • {detailer.rating} ★</p>
              </div>
            </div>
            <button 
              onClick={() => setShowChat(false)}
              className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-black hover:text-white active:scale-90 transition-all"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-grow overflow-y-auto p-4 space-y-6 bg-gray-50/50">
            <div className="text-center py-4">
               <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Today</p>
            </div>
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex flex-col max-w-[80%] ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`px-5 py-3 rounded-2xl text-sm font-bold shadow-sm ${
                    msg.sender === 'user' 
                      ? 'bg-black text-white rounded-br-none' 
                      : 'bg-white text-gray-800 rounded-bl-none border border-gray-100'
                  }`}>
                    {msg.text}
                  </div>
                  <span className="text-[9px] text-gray-400 font-bold mt-1.5 px-1">{msg.time}</span>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-gray-100 pb-8 safe-area-pb">
            <div className="flex items-center gap-3">
              <button type="button" className="p-3 bg-gray-100 rounded-2xl text-gray-400 hover:bg-gray-200 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
              </button>
              <div className="flex-grow relative">
                <input 
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="w-full bg-gray-50 border-2 border-transparent focus:bg-white focus:border-black rounded-2xl pl-4 pr-4 py-3.5 text-sm font-bold transition-all outline-none"
                />
              </div>
              <button 
                type="submit"
                disabled={!chatMessage.trim()}
                className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 active:scale-95 disabled:opacity-50 disabled:scale-100 disabled:shadow-none transition-all"
              >
                <svg className="w-5 h-5 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Manage Booking Modal */}
      {showManageBooking && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowManageBooking(false)} />
          <div 
            className="relative bg-white rounded-[40px] p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-black tracking-tighter">Manage Booking</h2>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowManageBooking(false);
                }}
                className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 active:scale-90 transition-all"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Booking Details */}
            <div className="space-y-6 mb-8">
              <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Service Details</h4>
                <div className="flex items-center gap-3 mb-3">
                  <div className="text-3xl">{service.icon}</div>
                  <div className="flex-grow">
                    <p className="font-black text-lg">{service.name}</p>
                    <p className="text-xs text-gray-500 font-medium">{service.duration}</p>
                  </div>
                  <p className="font-black text-xl">${displayPrice}</p>
                </div>
                <div className="pt-3 border-t border-gray-200">
                  <p className="text-xs text-gray-500 font-medium">Status: <span className="text-black font-bold">{getStatusText()}</span></p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Professional</h4>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl overflow-hidden">
                    <img src={detailer.avatar} alt={detailer.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-grow">
                    <p className="font-black text-base">{detailer.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-yellow-500 text-xs">★</span>
                      <span className="text-xs font-bold">{detailer.rating}</span>
                      <span className="text-xs text-gray-400">• {detailer.trips} trips</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 font-medium mt-3">{detailer.car}</p>
              </div>

              <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Location</h4>
                <p className="font-black text-base">Home</p>
                <p className="text-xs text-gray-500 font-medium mt-1">Current location</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              {onComplete && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowManageBooking(false);
                    onComplete();
                  }}
                  className="w-full bg-green-600 text-white py-4 rounded-2xl font-bold text-lg active:scale-95 transition-transform shadow-lg"
                >
                  Service complete
                </button>
              )}
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowManageBooking(false);
                  setShowChat(true);
                }}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg active:scale-95 transition-transform shadow-lg"
              >
                Message Professional
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowManageBooking(false);
                  // Placeholder for call functionality
                  alert('Calling ' + detailer.name);
                }}
                className="w-full bg-white border-2 border-gray-200 text-gray-900 py-4 rounded-2xl font-bold text-lg active:scale-95 transition-transform hover:border-gray-300"
              >
                Call Professional
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowManageBooking(false);
                  setShowCancelConfirm(true);
                }}
                className="w-full bg-red-50 border-2 border-red-100 text-red-600 py-4 rounded-2xl font-bold text-lg active:scale-95 transition-transform hover:bg-red-100"
              >
                Cancel Booking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCancelConfirm(false)} />
          <div className="relative bg-white rounded-[40px] p-8 w-full max-w-sm text-center shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            </div>
            <h2 className="text-3xl font-black mb-2 text-gray-900">Cancel Booking?</h2>
            <p className="text-gray-500 font-medium mb-8 leading-relaxed">
              Are you sure you want to cancel? Your professional {detailer.name} is already {status === BookingStatus.EN_ROUTE ? 'on the way' : 'at your location'}.
            </p>
            
            <div className="space-y-3">
              <button 
                onClick={onCancel}
                className="w-full bg-red-600 text-white py-4 rounded-2xl font-bold text-lg active:scale-95 transition-transform shadow-lg shadow-red-200"
              >
                Yes, Cancel Service
              </button>
              <button 
                onClick={() => setShowCancelConfirm(false)}
                className="w-full bg-gray-100 text-gray-700 py-4 rounded-2xl font-bold text-lg active:scale-95 transition-transform"
              >
                Keep Booking
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce-subtle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .animate-bounce-subtle {
          animation: bounce-subtle 3s ease-in-out infinite;
        }
      `}</style>
    </>
  );
};

export default ActiveBooking;

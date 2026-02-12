import { useState } from 'react';
import { submitDetailerApplication } from '../services/detailerApplications';

export function DetailerSignUp() {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    businessName: '',
    ein: '',
    businessType: '',
    dba: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    vehicleType: '',
    serviceArea: '',
    message: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error: submitError } = await submitDetailerApplication({
      full_name: formData.fullName,
      email: formData.email,
      phone: formData.phone,
      business_name: formData.businessName,
      ein: formData.ein,
      business_type: formData.businessType,
      dba: formData.dba || undefined,
      business_street: formData.street || undefined,
      business_city: formData.city || undefined,
      business_state: formData.state || undefined,
      business_zip: formData.zip || undefined,
      vehicle_type: formData.vehicleType || undefined,
      service_area: formData.serviceArea || undefined,
      message: formData.message || undefined,
    });

    setSubmitting(false);
    if (submitError) {
      setError(submitError.message || 'Failed to submit application');
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6 overflow-y-auto">
        <div className="bg-white rounded-3xl p-12 max-w-lg w-full text-center shadow-xl">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-3xl font-black mb-4">Application Submitted!</h2>
          <p className="text-gray-600 mb-8">
            Thank you for applying to join BRNNO. We&apos;ll review your application and reach out within 2-3 business days.
          </p>
          <a
            href="https://brnno.com"
            className="inline-block bg-black text-white px-8 py-4 rounded-2xl font-bold hover:bg-gray-900 transition"
          >
            Back to Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-12 px-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <a href="https://brnno.com" className="inline-block mb-8">
            <h1 className="text-4xl font-black">BRNNO</h1>
          </a>
          <h2 className="text-4xl md:text-5xl font-black mb-4">Join Our Detailer Network</h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Apply to become a verified BRNNO detailer and grow your business with on-demand bookings delivered straight
            to your phone.
          </p>
        </div>

        {/* Trust signals */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
            <div className="text-3xl font-black text-black mb-2">Flexible</div>
            <p className="text-gray-600 text-sm">Set your own schedule and service area</p>
          </div>
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
            <div className="text-3xl font-black text-black mb-2">Fair Pay</div>
            <p className="text-gray-600 text-sm">Keep 80% of every job you complete</p>
          </div>
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
            <div className="text-3xl font-black text-black mb-2">No Hassle</div>
            <p className="text-gray-600 text-sm">We handle payments, you handle the detail</p>
          </div>
        </div>

        {/* Application form */}
        <div className="bg-white rounded-3xl p-8 md:p-12 shadow-xl">
          <h3 className="text-2xl font-black mb-6">Application Form</h3>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-2xl text-red-700 text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Personal Info */}
            <div className="space-y-4">
              <h4 className="font-bold text-lg">Personal Information</h4>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Full Name *</label>
                  <input
                    type="text"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Email *</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Phone Number *</label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                  placeholder="(555) 000-0000"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none"
                />
              </div>
            </div>

            {/* Business Info */}
            <div className="space-y-4 pt-6 border-t-2 border-gray-100">
              <h4 className="font-bold text-lg">Business Information</h4>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Business Name *</label>
                  <input
                    type="text"
                    name="businessName"
                    value={formData.businessName}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">EIN *</label>
                  <input
                    type="text"
                    name="ein"
                    value={formData.ein}
                    onChange={handleChange}
                    required
                    placeholder="12-3456789"
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Business Type *</label>
                  <select
                    name="businessType"
                    value={formData.businessType}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none"
                  >
                    <option value="">Select type</option>
                    <option value="llc">LLC</option>
                    <option value="sole_proprietorship">Sole Proprietorship</option>
                    <option value="corporation">Corporation</option>
                    <option value="partnership">Partnership</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">DBA (if applicable)</label>
                  <input
                    type="text"
                    name="dba"
                    value={formData.dba}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="space-y-4 pt-6 border-t-2 border-gray-100">
              <h4 className="font-bold text-lg">Business Address</h4>

              <div>
                <label className="block text-sm font-semibold mb-2">Street Address *</label>
                <input
                  type="text"
                  name="street"
                  value={formData.street}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none"
                />
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">City *</label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">State *</label>
                  <input
                    type="text"
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    required
                    placeholder="UT"
                    maxLength={2}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Zip Code *</label>
                  <input
                    type="text"
                    name="zip"
                    value={formData.zip}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Service Info */}
            <div className="space-y-4 pt-6 border-t-2 border-gray-100">
              <h4 className="font-bold text-lg">Service Details</h4>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Vehicle Type *</label>
                  <select
                    name="vehicleType"
                    value={formData.vehicleType}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none"
                  >
                    <option value="">Select type</option>
                    <option value="van">Van</option>
                    <option value="truck">Truck</option>
                    <option value="suv">SUV</option>
                    <option value="trailer">Trailer</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Service Area *</label>
                  <input
                    type="text"
                    name="serviceArea"
                    value={formData.serviceArea}
                    onChange={handleChange}
                    required
                    placeholder="e.g. Salt Lake County, Utah County"
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Tell us about your experience (optional)</label>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  rows={4}
                  placeholder="Years of experience, specialties, certifications, etc."
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none resize-none"
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-black text-white py-4 rounded-2xl font-bold text-lg hover:bg-gray-900 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting...' : 'Submit Application'}
            </button>

            <p className="text-center text-sm text-gray-500">
              Already approved?{' '}
              <a href="/detailer/signin" className="text-black font-semibold hover:underline">
                Sign in here
              </a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

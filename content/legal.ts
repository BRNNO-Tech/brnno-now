export interface LegalSection {
  title: string;
  paragraphs: string[];
}

export const TERMS_SECTIONS: LegalSection[] = [
  {
    title: '1. Acceptance of Terms',
    paragraphs: [
      'By accessing or using the BRNNO mobile application and related services ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the Service. BRNNO reserves the right to update these Terms at any time; continued use of the Service after changes constitutes acceptance of the revised Terms.',
    ],
  },
  {
    title: '2. Description of Service',
    paragraphs: [
      'BRNNO connects customers with independent professional detailers for on-demand and scheduled vehicle detailing services. The Service includes booking, payment processing, real-time status updates, and communication between you and your assigned detailer. BRNNO acts as a technology platform only; detailing services are performed by independent contractors, not BRNNO employees.',
    ],
  },
  {
    title: '3. Account and Eligibility',
    paragraphs: [
      'You must create an account and provide accurate, current information to use the Service. You must be at least 18 years old and have the legal capacity to enter into a binding agreement. You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account.',
    ],
  },
  {
    title: '4. Bookings and Payments',
    paragraphs: [
      'When you book a service, you agree to pay the quoted price plus any applicable taxes and fees. Payment is processed at the time of booking or as otherwise indicated. Cancellation policies may apply; see in-app details at the time of booking. Refunds are handled in accordance with our cancellation policy and applicable law.',
      'You authorize BRNNO to charge your selected payment method for all fees incurred. Tips for detailers are optional and may be added before or after service completion.',
    ],
  },
  {
    title: '5. Your Responsibilities',
    paragraphs: [
      'You agree to provide a safe, accessible location for the detailing service and to ensure the vehicle is available at the scheduled time. You must not use the Service for any unlawful purpose or in any way that could damage, disable, or impair the Service. You are responsible for the accuracy of information you provide, including vehicle and location details.',
    ],
  },
  {
    title: '6. Disclaimers',
    paragraphs: [
      'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. BRNNO DOES NOT GUARANTEE THE QUALITY, TIMELINESS, OR OUTCOME OF ANY DETAILING SERVICE PERFORMED BY INDEPENDENT CONTRACTORS. TO THE FULLEST EXTENT PERMITTED BY LAW, BRNNO DISCLAIMS ALL WARRANTIES, INCLUDING MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.',
    ],
  },
  {
    title: '7. Limitation of Liability',
    paragraphs: [
      'TO THE MAXIMUM EXTENT PERMITTED BY LAW, BRNNO AND ITS AFFILIATES SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR GOODWILL, ARISING FROM YOUR USE OF THE SERVICE OR ANY DETAILING SERVICE. IN NO EVENT SHALL BRNNO\'S TOTAL LIABILITY EXCEED THE AMOUNT YOU PAID FOR THE SERVICE IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.',
    ],
  },
  {
    title: '8. Contact',
    paragraphs: [
      'Questions about these Terms may be sent to the contact information provided in the app or on the BRNNO website. Last updated: January 2025.',
    ],
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: '1. Introduction',
    paragraphs: [
      'BRNNO ("we," "our," or "us") respects your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and services. By using BRNNO, you consent to the practices described in this policy.',
    ],
  },
  {
    title: '2. Information We Collect',
    paragraphs: [
      'We collect information you provide directly, such as name, email, phone number, payment information, vehicle details, and service addresses. We also collect information automatically when you use the app, including device identifiers, IP address, and location data (with your permission) to match you with nearby detailers and show service availability.',
      'When you use the Service, we collect booking history, preferences, and communications related to your appointments.',
    ],
  },
  {
    title: '3. How We Use Your Information',
    paragraphs: [
      'We use your information to provide, maintain, and improve the Service; to process transactions and send related information; to match you with detailers and facilitate bookings; to send you updates, support messages, and (with your consent) marketing; to detect and prevent fraud; and to comply with legal obligations.',
      'Location data is used to find detailers near you, display your position on the map, and enable navigation for your assigned detailer.',
    ],
  },
  {
    title: '4. Sharing of Information',
    paragraphs: [
      'We share information with detailers as necessary to fulfill your booking (e.g., name, contact, service address, vehicle and service details). We share information with payment processors and other service providers who assist our operations, subject to confidentiality obligations.',
      'We may disclose information if required by law, to protect our rights or safety, or in connection with a merger or sale of assets. We do not sell your personal information to third parties for their marketing.',
    ],
  },
  {
    title: '5. Data Retention and Security',
    paragraphs: [
      'We retain your information for as long as your account is active or as needed to provide the Service, comply with law, or resolve disputes. We implement reasonable technical and organizational measures to protect your data; no method of transmission or storage is 100% secure.',
    ],
  },
  {
    title: '6. Your Choices and Rights',
    paragraphs: [
      'You may update your account information in the app. You can disable location access in your device settings, though some features may not work. You may opt out of marketing communications. Depending on your jurisdiction, you may have rights to access, correct, delete, or port your data, or to object to or restrict certain processing. Contact us to exercise these rights.',
    ],
  },
  {
    title: '7. Children',
    paragraphs: [
      'The Service is not intended for users under 18. We do not knowingly collect personal information from children. If you believe we have collected such information, please contact us so we can delete it.',
    ],
  },
  {
    title: '8. Changes and Contact',
    paragraphs: [
      'We may update this Privacy Policy from time to time; we will notify you of material changes via the app or email. Continued use after changes constitutes acceptance.',
      'For privacy-related questions or requests, contact us using the information in the app or on the BRNNO website. Last updated: January 2025.',
    ],
  },
];

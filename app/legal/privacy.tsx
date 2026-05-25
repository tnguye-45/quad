import { PRIVACY_MARKDOWN } from '@/legal';

import { LegalDocument } from './_renderer';

export default function PrivacyScreen() {
  return <LegalDocument title="Privacy Policy" markdown={PRIVACY_MARKDOWN} />;
}

import { TOS_MARKDOWN } from '@/legal';

import { LegalDocument } from './_renderer';

export default function TosScreen() {
  return <LegalDocument title="Terms of Service" markdown={TOS_MARKDOWN} />;
}

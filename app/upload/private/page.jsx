'use client';

import { Suspense } from 'react';
import DrivePage from '@/app/components/drive/DrivePage';
import Loader from '@/app/components/Loader';

export default function PrivateDrivePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-base"><Loader /></div>}>
      <DrivePage scope="private" />
    </Suspense>
  );
}

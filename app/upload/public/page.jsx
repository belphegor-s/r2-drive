'use client';

import { Suspense } from 'react';
import DrivePage from '@/app/components/drive/DrivePage';
import Loader from '@/app/components/Loader';

export default function PublicDrivePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas"><Loader /></div>}>
      <DrivePage scope="public" />
    </Suspense>
  );
}

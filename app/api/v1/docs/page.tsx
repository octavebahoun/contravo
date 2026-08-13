'use client';

import { useEffect, useState } from 'react';

export default function DocsPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh', 
        fontFamily: 'sans-serif', 
        backgroundColor: '#0f172a', 
        color: '#f8fafc' 
      }}>
        Loading API Documentation...
      </div>
    );
  }

  return (
    <>
      <div id="api-reference" data-url="/api/v1/openapi.json"></div>
      <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference" async></script>
    </>
  );
}

'use client';

/**
 * app/creations/page.tsx
 * My creations page - displays avatar generation history with pagination
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { GenerationHistory } from '@/lib/types';
import { downloadImage } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

const ITEMS_PER_PAGE = 12;

export default function CreationsPage() {
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const [history, setHistory] = useState<GenerationHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const supabase = createClient();
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  useEffect(() => {
    if (!profile && !isLoading) {
      router.push('/auth/login');
    }
  }, [profile, router, isLoading]);

  const fetchHistory = useCallback(async (page: number = 1) => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { count } = await supabase
        .from('generations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      setTotalCount(count || 0);

      const from = (page - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('Error fetching history:', error);
      } else {
        setHistory(data || []);
      }
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, supabase]);

  useEffect(() => {
    if (user) {
      fetchHistory(currentPage);
    }
  }, [user, currentPage, fetchHistory]);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleDownload = useCallback((imageUrl: string, index: number) => {
    downloadImage(imageUrl, `cartoon-avatar-${index + 1}.png`);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Are you sure you want to delete this avatar?')) return;

    setIsDeleting(id);
    try {
      const { error } = await supabase
        .from('generations')
        .delete()
        .eq('id', id);

      if (error) {
        alert('Failed to delete. Please try again.');
      } else {
        setHistory((prev) => prev.filter((h) => h.id !== id));
        setTotalCount((prev) => prev - 1);
      }
    } catch (error) {
      alert('Failed to delete. Please try again.');
    } finally {
      setIsDeleting(null);
    }
  }, [supabase]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.push('/');
  }, [signOut, router]);

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link 
                href="/" 
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span className="hidden sm:inline">Back to Home</span>
              </Link>
              <div className="w-px h-6 bg-gray-200 hidden sm:block" />
              <Link href="/" className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                  <span className="text-white text-xl">🎨</span>
                </div>
                <span className="text-xl font-bold text-gray-900 hidden sm:block">AI Cartoon Avatar</span>
              </Link>
            </div>

            <button
              onClick={handleSignOut}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">My Creations</h1>
          <p className="text-gray-600 mt-1">View and manage your generated avatars</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-gray-500 mb-4">No avatars generated yet</p>
              <Link href="/">
                <Button variant="primary" size="sm">
                  Create Your First Avatar
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {history.map((item, index) => (
                  <div 
                    key={item.id} 
                    className="group relative bg-gray-50 rounded-xl overflow-hidden border border-gray-100 hover:border-blue-200 hover:shadow-md transition-all"
                  >
                    <div className="aspect-square bg-gray-100">
                      <img
                        src={item.generated_image}
                        alt={`Generated avatar ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    
                    <div className="p-3">
                      <span className="inline-block px-2 py-1 bg-blue-50 text-blue-600 text-xs font-medium rounded-md">
                        {item.style}
                      </span>
                    </div>

                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleDownload(item.generated_image, index)}
                        className="p-2 bg-white/90 hover:bg-white text-gray-700 rounded-lg shadow-sm transition-all"
                        title="Download"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={isDeleting === item.id}
                        className="p-2 bg-white/90 hover:bg-white text-red-600 rounded-lg shadow-sm transition-all disabled:opacity-50"
                        title="Delete"
                      >
                        {isDeleting === item.id ? (
                          <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </div>

                    <div className="absolute bottom-12 left-2">
                      <span className="inline-block px-2 py-1 bg-black/50 text-white text-xs rounded-md">
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => handlePageChange(page)}
                      className={`w-10 h-10 rounded-lg font-medium transition-all ${
                        page === currentPage
                          ? 'bg-blue-500 text-white'
                          : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {page}
                    </button>
                  ))}

                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
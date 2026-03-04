'use client';

import { useEffect, useState, useCallback } from 'react';
import { TopNav } from '@/components/layout/TopNav';
import { useAuth } from '@/lib/auth-context';
import {
  DocumentSignature,
  CosignStatus,
  CLINICAL_DOC_TYPE_LABELS,
  ClinicalDocType,
  CLINIC_ROLE_LABELS,
  ClinicRole,
} from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { formatLocalDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  FileSignature,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  User,
  AlertCircle,
} from 'lucide-react';

interface SignatureWithDocument extends DocumentSignature {
  document?: {
    id: string;
    doc_type: ClinicalDocType;
    title?: string | null;
    date_of_service: string;
    output_text?: string | null;
    patient_id: string;
    created_by?: string | null;
  };
  patient_name?: string;
  author_name?: string;
  author_role?: string;
}

export default function CosignPage() {
  const { currentClinic, user, loading: authLoading } = useAuth();

  const [signatures, setSignatures] = useState<SignatureWithDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  // Review dialog
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedSignature, setSelectedSignature] = useState<SignatureWithDocument | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionInput, setShowRejectionInput] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const clinicId = currentClinic?.clinic_id;

  const fetchSignatures = useCallback(async () => {
    if (!clinicId || !user?.id) return;
    setLoading(true);

    try {
      // Fetch signatures assigned to the current user for co-signing
      const params = new URLSearchParams({
        clinic_id: clinicId,
        signature_type: 'cosigner',
      });
      if (filter === 'pending') {
        params.set('status', 'pending');
      }

      const sigRes = await fetch(`/api/signatures?${params.toString()}`);
      if (!sigRes.ok) throw new Error('Failed to fetch signatures');
      const sigData: DocumentSignature[] = await sigRes.json();

      // Filter signatures for the current user
      const userSignatures = sigData.filter((s) => s.signer_user_id === user.id);

      // Fetch document details for each signature
      const enrichedSignatures: SignatureWithDocument[] = await Promise.all(
        userSignatures.map(async (sig) => {
          try {
            // Fetch the document
            const docRes = await fetch(`/api/documents/${sig.document_id}`);
            if (!docRes.ok) {
              return { ...sig };
            }
            const doc = await docRes.json();

            // Fetch patient name
            let patientName = 'Unknown Patient';
            if (doc.patient_id) {
              const patRes = await fetch(`/api/patients/${doc.patient_id}`);
              if (patRes.ok) {
                const pat = await patRes.json();
                patientName = `${pat.last_name}, ${pat.first_name}`;
              }
            }

            // Fetch author signature to get author name/role
            let authorName = 'Unknown';
            let authorRole = '';
            const authorSigRes = await fetch(
              `/api/signatures?document_id=${sig.document_id}&signature_type=author`
            );
            if (authorSigRes.ok) {
              const authorSigs: DocumentSignature[] = await authorSigRes.json();
              if (authorSigs.length > 0) {
                authorName = authorSigs[0].signer_name;
                authorRole = authorSigs[0].signer_role;
              }
            }

            return {
              ...sig,
              document: doc,
              patient_name: patientName,
              author_name: authorName,
              author_role: authorRole,
            };
          } catch {
            return { ...sig };
          }
        })
      );

      setSignatures(enrichedSignatures);
    } catch (error) {
      console.error('Error fetching cosign data:', error);
      toast.error('Failed to load co-sign queue');
    } finally {
      setLoading(false);
    }
  }, [clinicId, user?.id, filter]);

  useEffect(() => {
    if (clinicId && user?.id) {
      fetchSignatures();
    }
  }, [clinicId, user?.id, filter, fetchSignatures]);

  const pendingCount = signatures.filter((s) => s.status === 'pending').length;

  const openReview = (sig: SignatureWithDocument) => {
    setSelectedSignature(sig);
    setRejectionReason('');
    setShowRejectionInput(false);
    setReviewDialogOpen(true);
  };

  const handleSign = async () => {
    if (!selectedSignature) return;
    setSubmitting(true);

    try {
      const res = await fetch(`/api/signatures/${selectedSignature.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sign' }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to sign document');
      }

      toast.success('Document signed successfully');
      setReviewDialogOpen(false);
      setSelectedSignature(null);
      fetchSignatures();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to sign document');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selectedSignature) return;

    if (!showRejectionInput) {
      setShowRejectionInput(true);
      return;
    }

    if (!rejectionReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`/api/signatures/${selectedSignature.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          rejection_reason: rejectionReason.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to reject document');
      }

      toast.success('Document rejected');
      setReviewDialogOpen(false);
      setSelectedSignature(null);
      fetchSignatures();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reject document');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: CosignStatus) => {
    const styles: Record<CosignStatus, { className: string; icon: React.ReactNode }> = {
      pending: {
        className: 'bg-amber-100 text-amber-700 border-amber-200',
        icon: <Clock className="h-3 w-3" />,
      },
      signed: {
        className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        icon: <CheckCircle2 className="h-3 w-3" />,
      },
      rejected: {
        className: 'bg-red-100 text-red-700 border-red-200',
        icon: <XCircle className="h-3 w-3" />,
      },
      expired: {
        className: 'bg-slate-100 text-slate-700 border-slate-200',
        icon: <AlertCircle className="h-3 w-3" />,
      },
    };
    const style = styles[status];
    return (
      <Badge variant="outline" className={`gap-1 ${style.className}`}>
        {style.icon}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getRoleLabel = (role: string): string => {
    const labels: Record<string, string> = {
      pt: 'PT',
      pta: 'PTA',
      admin: 'Admin',
      front_office: 'Front Office',
    };
    return labels[role] || role;
  };

  const getDocTypeLabel = (docType: string): string => {
    return CLINICAL_DOC_TYPE_LABELS[docType as ClinicalDocType] || docType;
  };

  if (authLoading || !currentClinic) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
        <TopNav />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-6">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <TopNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-slate-900">Documents Awaiting Co-Signature</h1>
              {pendingCount > 0 && (
                <Badge variant="destructive" className="text-sm px-3 py-1">
                  {pendingCount}
                </Badge>
              )}
            </div>
            <p className="text-slate-600 mt-1">
              Review and co-sign clinical documents requiring your approval
            </p>
          </div>
          <div>
            <Select
              value={filter}
              onValueChange={(val) => setFilter(val as 'pending' | 'all')}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : signatures.length === 0 ? (
          <Card>
            <CardContent className="py-16">
              <div className="text-center text-slate-500">
                <FileSignature className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                <p className="text-lg font-medium">No documents awaiting co-signature</p>
                <p className="text-sm mt-2">
                  {filter === 'pending'
                    ? 'All documents have been reviewed. Check "All" to see previous co-sign requests.'
                    : 'No co-sign requests found for your account.'}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {signatures.map((sig) => (
              <Card key={sig.id} className="hover:border-slate-300 transition-colors">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <FileText className="h-5 w-5 text-slate-400" />
                        <div>
                          <p className="font-semibold text-slate-900">
                            {sig.patient_name || 'Unknown Patient'}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="text-xs">
                              {sig.document
                                ? getDocTypeLabel(sig.document.doc_type)
                                : 'Document'}
                            </Badge>
                            {sig.document?.date_of_service && (
                              <span className="text-xs text-slate-500">
                                DOS: {formatLocalDate(sig.document.date_of_service, 'MM/dd/yyyy')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ml-8">
                        <User className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-sm text-slate-600">
                          Written by{' '}
                          <span className="font-medium">{sig.author_name || 'Unknown'}</span>
                          {sig.author_role && (
                            <span className="text-slate-400">
                              , {getRoleLabel(sig.author_role)}
                            </span>
                          )}
                        </span>
                      </div>

                      {sig.status === 'rejected' && sig.rejection_reason && (
                        <div className="ml-8 mt-2 p-2 bg-red-50 border border-red-100 rounded text-sm text-red-700">
                          Rejected: {sig.rejection_reason}
                        </div>
                      )}

                      {sig.status === 'signed' && sig.signed_at && (
                        <div className="ml-8 mt-1">
                          <span className="text-xs text-slate-400">
                            Signed {formatLocalDate(sig.signed_at, 'MM/dd/yyyy h:mm a')}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      {getStatusBadge(sig.status)}
                      {sig.status === 'pending' ? (
                        <Button size="sm" onClick={() => openReview(sig)} className="gap-1">
                          <FileSignature className="h-4 w-4" />
                          Review & Sign
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openReview(sig)}
                          className="gap-1"
                        >
                          <FileText className="h-4 w-4" />
                          View
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Review & Sign Dialog */}
        <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSignature className="h-5 w-5" />
                {selectedSignature?.status === 'pending' ? 'Review & Co-Sign' : 'Document Review'}
              </DialogTitle>
              <DialogDescription>
                {selectedSignature?.patient_name && (
                  <span className="font-medium">{selectedSignature.patient_name}</span>
                )}
                {selectedSignature?.document?.doc_type && (
                  <span>
                    {' - '}
                    {getDocTypeLabel(selectedSignature.document.doc_type)}
                  </span>
                )}
                {selectedSignature?.document?.date_of_service && (
                  <span>
                    {' - '}
                    DOS: {formatLocalDate(selectedSignature.document.date_of_service, 'MM/dd/yyyy')}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>

            {selectedSignature && (
              <div className="space-y-4">
                {/* Author info */}
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <User className="h-4 w-4" />
                  <span>
                    Written by{' '}
                    <span className="font-medium">{selectedSignature.author_name || 'Unknown'}</span>
                    {selectedSignature.author_role && (
                      <span>, {getRoleLabel(selectedSignature.author_role)}</span>
                    )}
                  </span>
                </div>

                <Separator />

                {/* Document Content */}
                <div className="bg-white border rounded-lg p-6 max-h-[40vh] overflow-y-auto">
                  {selectedSignature.document?.output_text ? (
                    <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                      {selectedSignature.document.output_text}
                    </div>
                  ) : (
                    <div className="text-center text-slate-400 py-8">
                      <FileText className="h-8 w-8 mx-auto mb-2" />
                      <p>No document content available</p>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Attestation */}
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                  <p className="text-sm font-medium text-blue-800 mb-1">Attestation</p>
                  <p className="text-sm text-blue-700">{selectedSignature.attestation}</p>
                </div>

                {/* Rejection input */}
                {showRejectionInput && selectedSignature.status === 'pending' && (
                  <div className="space-y-2">
                    <Label className="text-red-700">Reason for Rejection</Label>
                    <Input
                      placeholder="Please provide a reason for rejecting this document..."
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      className="border-red-200 focus:border-red-400"
                    />
                  </div>
                )}

                {/* Already signed/rejected status */}
                {selectedSignature.status === 'signed' && selectedSignature.signed_at && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-emerald-700">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="font-medium">
                        Signed on {formatLocalDate(selectedSignature.signed_at, 'MM/dd/yyyy h:mm a')}
                      </span>
                    </div>
                  </div>
                )}

                {selectedSignature.status === 'rejected' && (
                  <div className="bg-red-50 border border-red-100 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-red-700 mb-1">
                      <XCircle className="h-5 w-5" />
                      <span className="font-medium">
                        Rejected
                        {selectedSignature.rejected_at &&
                          ` on ${formatLocalDate(selectedSignature.rejected_at, 'MM/dd/yyyy h:mm a')}`}
                      </span>
                    </div>
                    {selectedSignature.rejection_reason && (
                      <p className="text-sm text-red-600 ml-7">
                        {selectedSignature.rejection_reason}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
                {selectedSignature?.status === 'pending' ? 'Cancel' : 'Close'}
              </Button>
              {selectedSignature?.status === 'pending' && (
                <>
                  <Button
                    variant="destructive"
                    onClick={handleReject}
                    disabled={submitting}
                    className="gap-1"
                  >
                    <XCircle className="h-4 w-4" />
                    {showRejectionInput ? 'Confirm Reject' : 'Reject'}
                  </Button>
                  <Button
                    onClick={handleSign}
                    disabled={submitting}
                    className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {submitting ? 'Signing...' : 'Sign'}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

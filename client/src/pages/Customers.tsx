import { FormEvent, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../services/api';
import { Badge, Button, Card, CardContent, EmptyState, Input, PageHeader, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui';

interface CustomerSummary {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  branchCode: string;
  kycStatus: string;
  createdAt: string;
}

export function Customers() {
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [scopedToBranch, setScopedToBranch] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(term: string) {
    if (term.length > 0 && term.length < 2) {
      setError('Enter at least two characters to search');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      // The counter search requires >=2 chars; an empty submit is not sent.
      if (!term) { setCustomers([]); setScopedToBranch(null); setSearched(false); return; }
      const res = await api.searchCustomers(term, 25);
      setCustomers((res.data?.customers as CustomerSummary[]) ?? []);
      setScopedToBranch(res.data?.scopedToBranch ?? null);
      setSearched(true);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Search failed');
      setCustomers([]);
      setSearched(false);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void runSearch(query.trim());
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Branch counter"
        title="Find a customer"
        description="Search your branch book by name, phone or email. Customer records outside your branch are never returned."
      />
      <form onSubmit={onSubmit} className="flex gap-2.5 max-w-xl">
        <Input
          aria-label="Search customers"
          placeholder="Name, phone or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button type="submit" isLoading={loading} leftIcon={<Search className="w-4 h-4" />}>
          Search
        </Button>
      </form>
      {error ? <p className="text-sm text-danger-700">{error}</p> : null}
      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : searched && customers.length === 0 ? (
        <EmptyState
          title="No customer found"
          description={
            scopedToBranch
              ? `No match in branch ${scopedToBranch}. Try another spelling, or check the branch code.`
              : 'Try a different name, phone, or email.'
          }
        />
      ) : customers.length > 0 ? (
        <Card>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>KYC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.fullName}</TableCell>
                      <TableCell>{c.phone}</TableCell>
                      <TableCell>{c.email}</TableCell>
                      <TableCell>{c.branchCode}</TableCell>
                      <TableCell>
                        <Badge variant={c.kycStatus === 'VERIFIED' ? 'success' : c.kycStatus === 'SUBMITTED' ? 'info' : 'gray'}>
                          {c.kycStatus}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <EmptyState title="Search the branch book" description="Type at least two characters above to look up a customer." />
      )}
    </div>
  );
}

export default Customers;
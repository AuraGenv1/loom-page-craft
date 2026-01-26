import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Printer, BookOpen, TrendingUp, AlertTriangle, DollarSign, Info } from 'lucide-react';

interface KdpFinanceCalculatorProps {
  pageCount: number;
}

const KdpFinanceCalculator: React.FC<KdpFinanceCalculatorProps> = ({ pageCount }) => {
  const [listPrice, setListPrice] = useState(14.99);
  const [printType, setPrintType] = useState<'bw' | 'standard' | 'premium'>('standard');

  const isStandardAvailable = pageCount >= 72;

  // Auto-switch if Standard is selected but not available
  useEffect(() => {
    if (printType === 'standard' && !isStandardAvailable) {
      setPrintType('premium');
    }
  }, [printType, isStandardAvailable]);

  // Amazon KDP 2025 Estimations (US Market - 6x9 Trim)
  const getPrintCost = () => {
    switch (printType) {
      case 'bw': return 1.00 + (pageCount * 0.012);
      case 'standard': return 1.00 + (pageCount * 0.036);
      case 'premium': return 1.00 + (pageCount * 0.070);
    }
  };

  const printCost = getPrintCost();
  const minPrice = printCost / 0.60;
  const royalty = (listPrice * 0.60) - printCost;
  const margin = listPrice > 0 ? (royalty / listPrice) * 100 : 0;

  return (
    <Card className="p-6 space-y-6">
      {/* Format & Print Cost Row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            <BookOpen className="h-4 w-4" />
            <span className="text-sm font-medium">Format</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{pageCount} Pages</p>
          <p className="text-sm text-muted-foreground">6" x 9" Trim</p>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Printer className="h-4 w-4" />
            <span className="text-sm font-medium">Print Cost</span>
          </div>
          <p className="text-2xl font-bold text-red-600">-${printCost.toFixed(2)}</p>
          <p className="text-sm text-muted-foreground">Per copy</p>
        </div>
      </div>

      {/* Ink Quality & List Price */}
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Ink Quality</Label>
            {!isStandardAvailable && <span className="text-xs text-muted-foreground">Standard requires 72+ pages</span>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setPrintType('bw')}
              className={`py-2 text-xs sm:text-sm rounded-md border transition-colors ${printType === 'bw' ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent border-border hover:bg-secondary'}`}
            >
              Black & White
            </button>
            <button
              onClick={() => isStandardAvailable && setPrintType('standard')}
              disabled={!isStandardAvailable}
              className={`py-2 text-xs sm:text-sm rounded-md border transition-colors ${
                printType === 'standard' ? 'bg-primary text-primary-foreground border-primary' : 
                !isStandardAvailable ? 'opacity-50 cursor-not-allowed bg-muted' : 'bg-transparent border-border hover:bg-secondary'
              }`}
            >
              Standard Color
            </button>
            <button
              onClick={() => setPrintType('premium')}
              className={`py-2 text-xs sm:text-sm rounded-md border transition-colors ${printType === 'premium' ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent border-border hover:bg-secondary'}`}
            >
              Premium Color
            </button>
          </div>
          {printType === 'standard' && (
            <div className="flex items-center gap-1 text-xs text-blue-600">
              <Info className="h-3 w-3" /> Best value for books with 10-20 images.
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="listPrice">List Price (USD)</Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="listPrice"
              type="number"
              value={listPrice}
              onChange={(e) => setListPrice(parseFloat(e.target.value))}
              className="pl-9"
              step="0.50"
            />
          </div>
          {listPrice < minPrice ? (
            <div className="flex items-center gap-2 text-amber-600 text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>Minimum price is ${minPrice.toFixed(2)}</span>
            </div>
          ) : (
             <div className="flex items-center gap-1 text-xs text-muted-foreground">
               <Info className="h-3 w-3" /> Amazon takes 40% + Print Cost
             </div>
          )}
        </div>
      </div>

      {/* Royalty Result */}
      <Card className={`p-4 ${royalty > 0 ? 'border-green-100 bg-green-50/50' : 'border-red-100 bg-red-50/50'}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className={`h-5 w-5 ${royalty > 0 ? 'text-green-600' : 'text-red-600'}`} />
            <span className="font-medium">Your Net Profit</span>
          </div>
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${royalty > 0 ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
            {margin.toFixed(0)}% Margin
          </span>
        </div>
        <p className={`text-3xl font-bold ${royalty > 0 ? 'text-green-600' : 'text-red-600'}`}>
          ${royalty.toFixed(2)}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Per copy sold.
        </p>
      </Card>
    </Card>
  );
};

export default KdpFinanceCalculator;

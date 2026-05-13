import React from 'react';
import { X, ExternalLink, FileText, Package, ClipboardList } from 'lucide-react';
import { config } from '../config';

const QuotePreviewModal = ({ isOpen, onClose, data }) => {
  if (!isOpen || !data) return null;

  const quote = data.records?.[0] || {};
  const lines = quote.QuoteLineItems || [];
  const isMeta = config.theme === 'Meta';
  
  const logoUrl = isMeta ? config.META_LOGO_URL : config.AGIVANT_LOGO_URL;

  // Calculate totals
  const totalContractValue = quote.GrandTotal || 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/50 modal-overlay">
      <div className="bg-white w-full max-w-6xl max-h-[90vh] rounded-lg shadow-2xl overflow-hidden flex flex-col border border-slate-200">
        
        {/* Header */}
        <div className={`px-8 py-5 ${isMeta ? 'bg-[#0084FF]' : 'bg-indigo-600'} flex items-center justify-between text-white`}>
          <div className="flex items-center gap-6">
            <div className="bg-white p-2 rounded-md shadow-sm">
              <img src={logoUrl} alt="Logo" className="h-5 w-auto object-contain" />
            </div>
            <div className="flex flex-col">
              <h2 className="text-xs font-black uppercase tracking-[0.2em]">Quote Architecture Studio</h2>
              <span className="text-[9px] font-bold opacity-80 uppercase tracking-widest">{quote.Status || 'DRAFT'}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/20">
          
          {/* Section: Quote Identification */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-slate-400">
              <ClipboardList size={14} className="text-indigo-500" />
              <h3 className="text-[10px] font-black uppercase tracking-widest">Quote Summary</h3>
            </div>
            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-6 py-3 text-[9px] font-black uppercase tracking-widest text-slate-500 text-left border-b border-slate-100">Quote ID</th>
                    <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-slate-500 text-left border-b border-slate-100">Quote Name</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-6 py-4 text-sm font-bold text-slate-900 border-r border-slate-50">{quote.QuoteNumber || '—'}</td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-900">{quote.Name || '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Section: Details */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-slate-400">
              <FileText size={14} className="text-indigo-500" />
              <h3 className="text-[10px] font-black uppercase tracking-widest">Details</h3>
            </div>
            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-6 py-3 text-[9px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100">Account Name</th>
                    <th className="px-6 py-3 text-[9px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100">Opportunity Name</th>
                    <th className="px-6 py-3 text-[9px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100">Start Date</th>
                    <th className="px-6 py-3 text-[9px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100 text-right">Total Contract Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="divide-x divide-slate-50">
                    <td className="px-6 py-5 text-sm font-bold text-slate-900">{quote.Account?.Name || '—'}</td>
                    <td className="px-6 py-5 text-sm font-bold text-slate-900">{quote.Opportunity?.Name || '—'}</td>
                    <td className="px-6 py-5 text-sm font-bold text-slate-900">{quote.StartDate || lines[0]?.StartDate || '—'}</td>
                    <td className="px-6 py-5 text-sm font-black text-indigo-600 text-right">${totalContractValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Section: Product Details */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-slate-400">
              <Package size={14} className="text-indigo-500" />
              <h3 className="text-[10px] font-black uppercase tracking-widest">Product Details</h3>
            </div>
            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
              <table className="w-full border-collapse">
                <thead>
                  <tr className={`${isMeta ? 'bg-[#0084FF] text-white' : 'bg-indigo-600 text-white'}`}>
                    <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-left">Product</th>
                    <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-right">Sales Price</th>
                    <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-center">Quantity</th>
                    <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-right">Subtotal</th>
                    <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-center">Discount</th>
                    <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-right">Total Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line, idx) => {
                    const subtotal = (line.ListPrice || 0) * (line.Quantity || 0);
                    return (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-medium text-slate-900">{line.Product2?.Name || '—'}</td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-500 text-right">${(line.UnitPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-900 text-center">{(line.Quantity || 0).toFixed(2)}</td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-500 text-right">${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-6 py-4 text-sm font-black text-indigo-600 text-center">{line.Discount ? `${line.Discount.toFixed(2)}%` : '0.00%'}</td>
                        <td className="px-6 py-4 text-sm font-black text-slate-900 text-right">${(line.TotalPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    );
                  })}
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan="6" className="px-6 py-12 text-center text-xs font-bold text-slate-400 uppercase tracking-widest italic">No products found in this configuration</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic"></span>
          <div className="flex items-center gap-4">
            <button 
              onClick={onClose}
              className="px-6 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={() => {
                const quoteId = quote.Id;
                const baseUrl = data.instance_url || 'https://agivant-8f-dev-ed.develop.lightning.force.com';
                if (quoteId) window.open(`${baseUrl}/lightning/r/Quote/${quoteId}/view`, '_blank');
              }}
              className={`px-8 py-2.5 ${isMeta ? 'bg-[#0084FF]' : 'bg-indigo-600'} text-white text-[10px] font-black uppercase tracking-widest rounded-md shadow-lg flex items-center gap-2 hover:opacity-90 transition-all active:scale-95`}
            >
              View in Salesforce <ExternalLink size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuotePreviewModal;

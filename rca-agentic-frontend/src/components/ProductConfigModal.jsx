import React, { useState, useEffect, useMemo } from 'react';
import { Settings, X, Zap, Search, Package, Minus, Plus, AlertCircle, Info } from 'lucide-react';
import { config } from '../config';

const ProductConfigModal = ({ isOpen, onClose, products, onConfirm }) => {
  const [items, setItems] = useState([]);
  const [errors, setErrors] = useState({});
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      setItems(products.map(p => ({ ...p })));
      setErrors({});
      setSearchQuery('');
    }
  }, [isOpen, products]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(item => 
      item.name.toLowerCase().includes(q) || 
      (item.sku && item.sku.toLowerCase().includes(q))
    );
  }, [items, searchQuery]);

  if (!isOpen) return null;

  const updateItem = (id, field, value) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        let val = value;
        if (field === 'quantity') {
          val = Math.max(1, parseInt(value) || 1);
        }
        if (field === 'discount') {
          if (value === '') {
            val = '';
          } else {
            val = Math.min(100, Math.max(0, parseFloat(value) || 0));
          }
        }
        
        const newItem = { ...item, [field]: val };
        
        if (field === 'discount' && parseFloat(value) > 100) {
          setErrors(prevErr => ({ ...prevErr, [id]: 'Discount cannot exceed 100%' }));
        } else if (field === 'discount') {
          setErrors(prevErr => {
            const newErr = { ...prevErr };
            delete newErr[id];
            return newErr;
          });
        }
        
        return newItem;
      }
      return item;
    }));
  };

  const handleCreateQuote = () => {
    if (Object.keys(errors).length > 0) return;
    const cleanedItems = items.map(item => ({
      ...item,
      discount: item.discount === '' ? 0 : item.discount
    }));
    onConfirm(cleanedItems);
  };

  const isMeta = config.theme === 'Meta';
  const totalQuantity = items.reduce((acc, item) => acc + (parseInt(item.quantity) || 0), 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-2xl bg-black/70 modal-overlay transition-all duration-500 animate-in fade-in">
      <div className="bg-[var(--site-bg)] w-full max-w-5xl h-[85vh] rounded-[2rem] shadow-[0_32px_120px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col border border-white/10 relative">
        
        <div className={`absolute -top-40 -right-40 w-80 h-80 rounded-full blur-[100px] opacity-20 pointer-events-none ${isMeta ? 'bg-[#0084FF]' : 'bg-indigo-600'}`} />
        <div className={`absolute -bottom-40 -left-40 w-80 h-80 rounded-full blur-[100px] opacity-10 pointer-events-none ${isMeta ? 'bg-[#31A24C]' : 'bg-purple-600'}`} />

        {/* Header */}
        <div className="px-10 py-7 border-b border-white/10 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-5">
            <div className={`p-3 rounded-2xl ${isMeta ? 'bg-[#0084FF]' : 'bg-indigo-600'} shadow-lg text-white`}>
              <Settings size={20} strokeWidth={2.5} />
            </div>
            <div className="flex flex-col">
              <h2 className="text-xl font-black text-[var(--text-main)] tracking-[0.1em] uppercase leading-none">Product Configuration</h2>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2 opacity-70">{items.length} Items Pipeline</span>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white/5 rounded-2xl text-slate-500 hover:text-white transition-all active:scale-90">
            <X size={24} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-10 py-5 bg-white/[0.01] border-b border-white/5 flex items-center justify-between gap-6 z-10">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input 
              type="text" 
              placeholder="Search items by name..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/30 border border-white/5 rounded-2xl py-3 pl-12 pr-6 text-[11px] font-bold text-[var(--text-main)] placeholder-slate-600 outline-none focus:border-indigo-500/40 transition-all"
            />
          </div>
          <div className="flex items-center gap-6 bg-white/5 px-6 py-3 rounded-2xl border border-white/5">
             <div className="flex flex-col items-end">
               <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest opacity-60">Total Units</span>
               <span className="text-sm font-black text-indigo-500">{totalQuantity}</span>
             </div>
          </div>
        </div>

        {/* Product List - Reverted to Row-based Cards with Borders */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative z-10 space-y-3">
          {filteredItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-20 py-20">
              <Package size={48} className="mb-4" />
              <p className="text-xs font-black uppercase tracking-widest">No matching products</p>
            </div>
          ) : (
            filteredItems.map(item => (
              <div key={item.id} className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 flex items-center justify-between gap-6 group hover:bg-white/[0.05] hover:border-indigo-500/30 transition-all shadow-sm">
                <div className="flex items-center gap-5 flex-1 min-w-0">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-white/5 border border-white/5 text-slate-400 group-hover:text-indigo-400 transition-colors`}>
                    <Package size={20} />
                  </div>
                  <div className="text-xs font-black text-[var(--text-main)] uppercase tracking-tight truncate flex-1">{item.name}</div>
                </div>
                
                <div className="flex items-center gap-10">
                  {/* Quantity */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-0.5 opacity-50">Quantity</label>
                    <div className="flex items-center bg-white/5 rounded-xl p-1 border border-white/10">
                      <button 
                        onClick={() => updateItem(item.id, 'quantity', (parseInt(item.quantity) || 1) - 1)}
                        className="p-1.5 hover:bg-indigo-500/20 rounded-lg text-indigo-500 transition-all active:scale-90"
                      >
                        <Minus size={14} strokeWidth={3} />
                      </button>
                      <input 
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                        className="w-10 bg-transparent border-none text-center text-xs font-black text-[var(--text-main)] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button 
                        onClick={() => updateItem(item.id, 'quantity', (parseInt(item.quantity) || 1) + 1)}
                        className="p-1.5 hover:bg-indigo-500/20 rounded-lg text-indigo-500 transition-all active:scale-90"
                      >
                        <Plus size={14} strokeWidth={3} />
                      </button>
                    </div>
                  </div>

                  {/* Discount */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-0.5 opacity-50">Discount %</label>
                    <div className="relative">
                      <input 
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={item.discount}
                        onChange={(e) => updateItem(item.id, 'discount', e.target.value)}
                        className={`w-28 bg-white/5 border ${errors[item.id] ? 'border-red-500/40' : 'border-white/10'} rounded-xl py-2 px-4 text-xs font-black text-[var(--text-main)] outline-none focus:border-indigo-500/50 transition-all text-right pr-10`}
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] text-slate-500 font-black">%</div>
                    </div>
                  </div>
                </div>
              </div>
            )
          ))}
        </div>

        {/* Global Alert */}
        {Object.keys(errors).length > 0 && (
          <div className="mx-10 mb-4 p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-[9px] font-black uppercase tracking-widest flex items-center gap-3">
            <AlertCircle size={14} />
            <span>Incentive threshold exceeded. Max 100%.</span>
          </div>
        )}

        {/* Footer */}
        <div className="px-10 py-8 border-t border-white/10 flex items-center justify-between bg-white/[0.01] relative z-10">
          <div className="flex items-center gap-3 text-slate-500">
            <Info size={16} className="text-indigo-500/50" />
            <span className="text-[9px] font-black uppercase tracking-widest opacity-40 italic">CPQ Validation Active</span>
          </div>
          <div className="flex items-center gap-6">
            <button 
              onClick={onClose}
              className="px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={handleCreateQuote}
              disabled={Object.keys(errors).length > 0}
              className={`px-10 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 transition-all active:scale-95 shadow-xl ${Object.keys(errors).length > 0 ? 'bg-slate-500/20 text-slate-500 cursor-not-allowed' : (isMeta ? 'bg-[#0084FF]' : 'bg-indigo-600') + ' text-white shadow-indigo-500/20'}`}
            >
              <Zap size={14} fill="currentColor" />
              Generate Quote
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductConfigModal;

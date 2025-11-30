// components/modals/FriendRequestsModal.tsx
import { useState, useEffect } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { X, Inbox, Check, XCircle, Loader, AlertCircle, Clock, ArrowRight } from "lucide-react";
import type { FriendRequest } from "@/types";

interface FriendRequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingRequests: FriendRequest[];
  sentRequests: FriendRequest[];
  onAccept: (requestId: number) => Promise<void>;
  onReject: (requestId: number) => Promise<void>;
  onCancel: (requestId: number) => Promise<void>;
}

type RequestTab = "incoming" | "outgoing";

export default function FriendRequestsModal({
  isOpen,
  onClose,
  pendingRequests,
  sentRequests,
  onAccept,
  onReject,
  onCancel,
}: FriendRequestsModalProps) {
  const { isDarkMode } = useTheme();
  const [activeTab, setActiveTab] = useState<RequestTab>("incoming");
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const handleAccept = async (requestId: number) => {
    setProcessingId(requestId);
    setError("");
    try {
      await onAccept(requestId);
    } catch (err: any) {
      setError(err.message || "Failed to accept request");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId: number) => {
    setProcessingId(requestId);
    setError("");
    try {
      await onReject(requestId);
    } catch (err: any) {
      setError(err.message || "Failed to reject request");
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancel = async (requestId: number) => {
    setProcessingId(requestId);
    setError("");
    try {
      await onCancel(requestId);
    } catch (err: any) {
      setError(err.message || "Failed to cancel request");
    } finally {
      setProcessingId(null);
    }
  };

  if (!isOpen) return null;

  const incomingCount = pendingRequests.length;
  const outgoingCount = sentRequests.length;
  const displayRequests = activeTab === "incoming" ? pendingRequests : sentRequests;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
      {/* Modal Container */}
      <div
        className={`
          w-full max-w-2xl rounded-3xl shadow-2xl border
          max-h-[85vh] overflow-y-auto flex flex-col
          ${isDarkMode
            ? "bg-slate-900/95 border-slate-700/50 backdrop-blur-xl"
            : "bg-white/95 border-gray-200/70 backdrop-blur-xl"
          }
        `}
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: isDarkMode
            ? "#64748b transparent"
            : "#94a3b8 transparent",
        }}
      >
        {/* Webkit-specific scrollbar styling */}
        <style>{`
          .friend-requests-modal::-webkit-scrollbar {
            width: 10px;
          }
          .friend-requests-modal::-webkit-scrollbar-track {
            background: transparent;
            border-radius: 12px;
          }
          .friend-requests-modal::-webkit-scrollbar-thumb {
            background-color: ${isDarkMode ? "#64748b" : "#94a3b8"};
            border-radius: 12px;
            border: 3px solid ${isDarkMode ? "#1e293b" : "white"};
            background-clip: padding-box;
          }
          .friend-requests-modal:hover::-webkit-scrollbar-thumb {
            background-color: ${isDarkMode ? "#94a3b8" : "#64748b"};
          }
        `}</style>

        {/* Sticky Header */}
        <div
          className={`sticky top-0 z-10 p-5 border-b backdrop-blur-xl
            ${isDarkMode ? "bg-slate-900/80 border-slate-700/70" : "bg-white/80 border-gray-200/70"}
          `}
        >
          {/* Header Title */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Inbox className="w-5 h-5 text-white drop-shadow-sm" />
              </div>
              <h2
                className={`text-xl font-bold tracking-tight ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                Friend Requests
              </h2>
            </div>
            <button
              onClick={onClose}
              className={`p-2.5 rounded-xl transition-all duration-200 ${
                isDarkMode
                  ? "hover:bg-slate-800/80 text-gray-400"
                  : "hover:bg-gray-100 text-gray-600"
              } active:scale-95`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("incoming")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
                activeTab === "incoming"
                  ? isDarkMode
                    ? "bg-slate-800 text-white"
                    : "bg-gray-100 text-gray-900"
                  : isDarkMode
                  ? "text-gray-400 hover:text-gray-300"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <ArrowRight className="w-4 h-4" />
              Incoming
              {incomingCount > 0 && (
                <span
                  className={`ml-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                    activeTab === "incoming"
                      ? "bg-blue-600 text-white"
                      : isDarkMode
                      ? "bg-slate-700 text-gray-300"
                      : "bg-gray-300 text-gray-700"
                  }`}
                >
                  {incomingCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("outgoing")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
                activeTab === "outgoing"
                  ? isDarkMode
                    ? "bg-slate-800 text-white"
                    : "bg-gray-100 text-gray-900"
                  : isDarkMode
                  ? "text-gray-400 hover:text-gray-300"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Clock className="w-4 h-4" />
              Outgoing
              {outgoingCount > 0 && (
                <span
                  className={`ml-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                    activeTab === "outgoing"
                      ? "bg-blue-600 text-white"
                      : isDarkMode
                      ? "bg-slate-700 text-gray-300"
                      : "bg-gray-300 text-gray-700"
                  }`}
                >
                  {outgoingCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {/* Error Message */}
          {error && (
            <div className="m-4 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl backdrop-blur-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Requests List */}
          {displayRequests.length > 0 ? (
            <div className="p-4 space-y-3">
              {displayRequests.map((request) => (
                <div
                  key={request.id}
                  className={`p-4 rounded-2xl border transition-all
                    ${isDarkMode
                      ? "bg-slate-800/50 border-slate-700/50 hover:bg-slate-800/70"
                      : "bg-gray-50/50 border-gray-200/50 hover:bg-gray-100/70"
                    }`}
                >
                  <div className="flex items-center justify-between">
                    {/* User Info */}
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      {/* Avatar */}
                      {request.avatar_url ? (
                        <img
                          src={request.avatar_url}
                          alt={request.display_name}
                          className="w-14 h-14 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 bg-gradient-to-br from-purple-500 to-pink-500">
                          {request.display_name?.[0]?.toUpperCase() ||
                            request.username[0].toUpperCase()}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <h3
                          className={`font-semibold truncate ${
                            isDarkMode ? "text-white" : "text-gray-900"
                          }`}
                        >
                          {request.display_name || request.username}
                        </h3>
                        <p
                          className={`text-xs ${
                            isDarkMode ? "text-gray-400" : "text-gray-600"
                          }`}
                        >
                          @{request.username}
                        </p>
                        {request.created_at && (
                          <p
                            className={`text-xs mt-1 ${
                              isDarkMode ? "text-gray-500" : "text-gray-500"
                            }`}
                          >
                            {new Date(request.created_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                      {activeTab === "incoming" ? (
                        <>
                          <button
                            onClick={() => handleAccept(request.id)}
                            disabled={processingId === request.id}
                            className="p-2.5 rounded-xl bg-green-600/20 text-green-500 hover:bg-green-600/30 transition-all disabled:opacity-60"
                            title="Accept request"
                          >
                            {processingId === request.id ? (
                              <Loader className="w-5 h-5 animate-spin" />
                            ) : (
                              <Check className="w-5 h-5" />
                            )}
                          </button>
                          <button
                            onClick={() => handleReject(request.id)}
                            disabled={processingId === request.id}
                            className="p-2.5 rounded-xl bg-red-600/20 text-red-500 hover:bg-red-600/30 transition-all disabled:opacity-60"
                            title="Reject request"
                          >
                            {processingId === request.id ? (
                              <Loader className="w-5 h-5 animate-spin" />
                            ) : (
                              <XCircle className="w-5 h-5" />
                            )}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleCancel(request.id)}
                          disabled={processingId === request.id}
                          className="px-4 py-2 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 transition-all disabled:opacity-60"
                        >
                          {processingId === request.id ? (
                            <>
                              <Loader className="w-4 h-4 animate-spin inline mr-2" />
                              Cancelling...
                            </>
                          ) : (
                            "Cancel"
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <Inbox
                className={`w-12 h-12 mb-3 ${
                  isDarkMode ? "text-gray-600" : "text-gray-400"
                }`}
              />
              <p
                className={`text-center font-medium ${
                  isDarkMode ? "text-gray-300" : "text-gray-700"
                }`}
              >
                {activeTab === "incoming"
                  ? "No incoming requests"
                  : "No outgoing requests"}
              </p>
              <p
                className={`text-center text-sm mt-2 ${
                  isDarkMode ? "text-gray-500" : "text-gray-600"
                }`}
              >
                {activeTab === "incoming"
                  ? "You don't have any pending friend requests"
                  : "You haven't sent any friend requests"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

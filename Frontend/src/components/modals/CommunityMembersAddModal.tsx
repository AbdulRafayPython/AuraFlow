// components/modals/CommunityMembersAddModal.tsx
import React, { useState, useEffect, useRef } from "react";
import { X, Search, UserPlus, Users, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { channelService } from "@/services/channelService";

interface User {
  id: number;
  username: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
}

interface CommunityMember extends User {
  role: "owner" | "admin" | "member";
}

interface CommunityMembersAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  communityId: number;
  existingMembers?: CommunityMember[];
  onMemberAdded?: () => void;
}

export default function CommunityMembersAddModal({
  isOpen,
  onClose,
  communityId,
  existingMembers = [],
  onMemberAdded,
}: CommunityMembersAddModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [members, setMembers] = useState<CommunityMember[]>(existingMembers);
  const [isSearching, setIsSearching] = useState(false);
  const [addingUserId, setAddingUserId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debug log
  useEffect(() => {
    console.log("Modal isOpen:", isOpen);
    console.log("Community ID:", communityId);
    console.log("Existing members:", existingMembers);
  }, [isOpen, communityId, existingMembers]);

  // Sync external members changes
  useEffect(() => {
    setMembers(existingMembers);
  }, [existingMembers]);

  // Auto-focus input
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    } else {
      setSearchQuery("");
      setSearchResults([]);
    }
  }, [isOpen]);

  // Search users (debounced)
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await channelService.searchUsers(searchQuery);
        const filtered = results.filter(
          (user) => !members.some((m) => m.id === user.id)
        );
        setSearchResults(filtered);
      } catch (err) {
        console.error("Search error:", err);
        toast.error("Failed to search users");
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timeout);
  }, [searchQuery, members]);

  const handleAddMember = async (userId: number) => {
    setAddingUserId(userId);
    try {
      await channelService.addCommunityMember(communityId, userId);
      toast.success("Member added successfully!");

      // Refresh members
      const updated = await channelService.getCommunityMembers(communityId);
      setMembers(updated);

      setSearchQuery("");
      setSearchResults([]);
      onMemberAdded?.();
    } catch (err: any) {
      console.error("Add member error:", err);
      toast.error(err.message || "Failed to add member");
    } finally {
      setAddingUserId(null);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Don't render if not open
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-3xl flex items-center justify-center shadow-xl">
              <Users className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Add Members
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Search by username or email • {members.length} current members
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-all hover:scale-105"
          >
            <X className="w-6 h-6 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Search */}
        <div className="p-6 border-b border-gray-200 dark:border-slate-700">
          <div className="relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Type username or email (min 2 chars)..."
              className="w-full pl-14 pr-5 py-4 rounded-2xl bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-600 focus:border-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-500/20 text-base font-medium transition-all text-gray-900 dark:text-white"
            />
            {isSearching && (
              <Loader2 className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin text-purple-500" />
            )}
          </div>

          {/* Search Results Dropdown */}
          {searchQuery && searchResults.length > 0 && (
            <div className="mt-3 bg-gray-50 dark:bg-slate-800/70 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-lg overflow-hidden">
              {searchResults.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleAddMember(user.id)}
                  disabled={addingUserId === user.id}
                  className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-slate-700/70 transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      {user.avatar_url ? (
                        <img
                          src={user.avatar_url}
                          alt={user.username}
                          className="w-12 h-12 rounded-full object-cover ring-2 ring-white dark:ring-slate-900"
                        />
                      ) : (
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
                          style={{ backgroundColor: `#${((user.id * 12345) % 16777215).toString(16).padStart(6, '0')}` }}
                        >
                          {getInitials(user.display_name || user.username)}
                        </div>
                      )}
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {user.display_name || user.username}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {user.email}
                      </p>
                    </div>
                  </div>
                  {addingUserId === user.id ? (
                    <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                  ) : (
                    <UserPlus className="w-5 h-5 text-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* No results message */}
          {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
            <div className="mt-3 text-center py-4 text-sm text-gray-500 dark:text-gray-400">
              No users found matching "{searchQuery}"
            </div>
          )}
        </div>

        {/* Current Members List */}
        <div className="flex-1 overflow-y-auto p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Current Members
          </h3>
          {members.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-12">
              No members yet. Invite some!
            </p>
          ) : (
            <div className="space-y-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 dark:bg-slate-800/70 border border-gray-200 dark:border-slate-700"
                >
                  <div className="flex items-center gap-4">
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={member.username}
                        className="w-11 h-11 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold"
                        style={{ backgroundColor: `#${((member.id * 12345) % 16777215).toString(16).padStart(6, '0')}` }}
                      >
                        {getInitials(member.display_name || member.username)}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {member.display_name || member.username}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {member.email}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      member.role === "owner"
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300"
                        : member.role === "admin"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                        : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    }`}
                  >
                    {member.role}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
import { useState, useEffect } from 'react';
import { getImageUrl } from '../config/api';
import { designGroupService } from '../services/api';
import './DesignGroupPicker.css';

const DesignGroupPicker = ({
  categoryId,
  selectedGroupId,
  onSelectGroup,
  onCreateGroup,
  disabled = false,
  createOnly = false,
}) => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  useEffect(() => {
    if (categoryId && !createOnly) {
      loadGroups();
    }
  }, [categoryId, createOnly]);

  const loadGroups = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await designGroupService.getByCategory(categoryId);
      setGroups(data || []);
    } catch (err) {
      console.error('Failed to load design groups:', err);
      setError('Failed to load design groups');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectGroup = (groupId) => {
    if (disabled) return;
    // Toggle selection - if already selected, deselect
    if (selectedGroupId === groupId) {
      onSelectGroup(null);
    } else {
      onSelectGroup(groupId);
    }
  };

  const handleCreateGroup = () => {
    if (disabled || !newGroupName.trim()) return;
    onCreateGroup(newGroupName.trim());
    setNewGroupName('');
    setShowCreateNew(false);
  };

  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  return (
    <div className={`design-group-picker ${disabled ? 'disabled' : ''}`}>
      <div className="picker-header">
        <label>Design Group (Optional)</label>
        {selectedGroup && (
          <button
            className="btn-clear-selection"
            onClick={() => onSelectGroup(null)}
            disabled={disabled}
            type="button"
          >
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="picker-loading">Loading groups...</div>
      ) : error ? (
        <div className="picker-error">{error}</div>
      ) : (
        <>
          {/* Selected group display */}
          {!createOnly && selectedGroup && (
            <div className="selected-group-display">
              <div className="selected-group-preview">
                {selectedGroup.primaryPicture && (
                  <img
                    src={getImageUrl(selectedGroup.primaryPicture.filePath)}
                    alt={selectedGroup.name || 'Design group'}
                  />
                )}
              </div>
              <div className="selected-group-info">
                <span className="selected-group-name">
                  {selectedGroup.name || `Group #${selectedGroup.id}`}
                </span>
                <span className="selected-group-count">
                  {selectedGroup._count?.pictures || selectedGroup.pictures?.length || 0} photos
                </span>
              </div>
            </div>
          )}

          {/* Group selection grid */}
          {!createOnly && !selectedGroup && groups.length > 0 && (
            <div className="groups-grid">
              {groups.map((group) => (
                <button
                  key={group.id}
                  className={`group-option ${selectedGroupId === group.id ? 'selected' : ''}`}
                  onClick={() => handleSelectGroup(group.id)}
                  disabled={disabled}
                  type="button"
                >
                  <div className="group-option-preview">
                    {group.primaryPicture ? (
                      <img
                        src={getImageUrl(group.primaryPicture.filePath)}
                        alt={group.name || 'Design group'}
                      />
                    ) : group.pictures?.[0] ? (
                      <img
                        src={getImageUrl(group.pictures[0].filePath)}
                        alt={group.name || 'Design group'}
                      />
                    ) : (
                      <div className="no-preview">No preview</div>
                    )}
                  </div>
                  <div className="group-option-info">
                    <span className="group-option-name">
                      {group.name || `Group #${group.id}`}
                    </span>
                    <span className="group-option-count">
                      {group._count?.pictures || 0} photos
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* No groups message */}
          {!createOnly && !selectedGroup && groups.length === 0 && !showCreateNew && (
            <div className="no-groups-message">
              No design groups in this category yet.
            </div>
          )}

          {/* Create new group section */}
          {(createOnly || !selectedGroup) && (
            <div className="create-group-section">
              {showCreateNew ? (
                <div className="create-group-form">
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Enter group name (optional)"
                    disabled={disabled}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateGroup();
                      }
                    }}
                  />
                  <div className="create-group-actions">
                    <button
                      type="button"
                      className="btn-create-confirm"
                      onClick={handleCreateGroup}
                      disabled={disabled}
                    >
                      Create Group
                    </button>
                    <button
                      type="button"
                      className="btn-create-cancel"
                      onClick={() => {
                        setShowCreateNew(false);
                        setNewGroupName('');
                      }}
                      disabled={disabled}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn-create-new"
                  onClick={() => setShowCreateNew(true)}
                  disabled={disabled}
                >
                  <span className="plus-icon">+</span>
                  Create New Group
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DesignGroupPicker;

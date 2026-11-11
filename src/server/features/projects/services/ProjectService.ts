import {
  archiveProject,
  createProject,
  getProjectForOrganization,
  getProjectOrganizationId,
  listArchivedProjects,
  listProjects,
  listProjectsEnsuringOne,
  restoreProject,
  setProjectSiteType,
  setProjectWebsite,
  updateProject,
} from "@/server/features/projects/services/projects";
import { deleteArchivedProject } from "@/server/features/projects/services/deleteProject";

export const ProjectService = {
  listProjects,
  listProjectsEnsuringOne,
  createProject,
  updateProject,
  setProjectWebsite,
  setProjectSiteType,
  archiveProject,
  restoreProject,
  deleteArchivedProject,
  listArchivedProjects,
  getProjectForOrganization,
  getProjectOrganizationId,
} as const;

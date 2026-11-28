// Generated projection of owner schemas; CI compares to exact source bytes and pin.
export const PERIPH_SOURCE_COMMIT = 'a36c2d7c42b0bb3f4b2e4c78b42b999be0fac6cd';
export const PERIPH_SCHEMAS = {
  "descriptor": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "urn:openrgd:console:peripheral-descriptor:v0.1-candidate",
    "title": "Peripheral manager static sensor descriptor",
    "description": "Design-only candidate. No host device access or operational control is installed by this schema.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "schema_version",
      "robot_id",
      "peripheral_id",
      "display_name",
      "category",
      "source_kind",
      "binding",
      "publisher",
      "streams",
      "capabilities",
      "actuation_enabled"
    ],
    "properties": {
      "schema_version": {
        "const": "console.peripheral-descriptor.v0.1-candidate"
      },
      "robot_id": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]{0,79}$"
      },
      "peripheral_id": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]{0,79}$"
      },
      "display_name": {
        "type": "string",
        "minLength": 1,
        "maxLength": 100
      },
      "category": {
        "enum": [
          "imu",
          "camera",
          "microphone",
          "depth",
          "lidar",
          "environment",
          "range_sensor",
          "generic"
        ]
      },
      "source_kind": {
        "enum": [
          "physical",
          "simulated"
        ]
      },
      "binding": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "transport",
          "binding_ref",
          "verification"
        ],
        "properties": {
          "transport": {
            "enum": [
              "usb_serial",
              "usb_video",
              "usb_audio",
              "ethernet",
              "i2c",
              "spi",
              "virtual"
            ]
          },
          "binding_ref": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9:._-]{0,127}$"
          },
          "verification": {
            "enum": [
              "configured_unverified",
              "operator_verified",
              "not_configured"
            ]
          }
        }
      },
      "publisher": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "publisher_id",
          "host_id",
          "manager",
          "service_ref",
          "resource_lock",
          "ownership",
          "startup_policy"
        ],
        "properties": {
          "publisher_id": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9._-]{0,99}$"
          },
          "host_id": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9:._-]{0,127}$"
          },
          "manager": {
            "enum": [
              "systemd_user",
              "external_read_only"
            ]
          },
          "service_ref": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9:._-]{0,127}$"
          },
          "resource_lock": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9:._-]{0,127}$"
          },
          "ownership": {
            "enum": [
              "exclusive_device_owner",
              "externally_managed"
            ]
          },
          "startup_policy": {
            "enum": [
              "manual",
              "on_host_boot_explicit"
            ]
          }
        }
      },
      "streams": {
        "type": "array",
        "minItems": 1,
        "maxItems": 16,
        "uniqueItems": true,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "stream_id",
            "sample_schema",
            "data_class",
            "freshness_ms",
            "nominal_rate_hz",
            "fanout",
            "buffer_policy"
          ],
          "properties": {
            "stream_id": {
              "type": "string",
              "pattern": "^[a-z][a-z0-9._-]{0,99}$"
            },
            "sample_schema": {
              "type": "string",
              "minLength": 4,
              "maxLength": 150
            },
            "data_class": {
              "enum": [
                "sensor_observation",
                "privacy_sensitive_media"
              ]
            },
            "freshness_ms": {
              "type": "integer",
              "minimum": 50,
              "maximum": 60000
            },
            "nominal_rate_hz": {
              "type": [
                "number",
                "null"
              ],
              "exclusiveMinimum": 0,
              "maximum": 1000
            },
            "fanout": {
              "const": "multiple_read_only_consumers"
            },
            "buffer_policy": {
              "enum": [
                "latest_only",
                "bounded_replay"
              ]
            }
          }
        }
      },
      "capabilities": {
        "type": "array",
        "minItems": 1,
        "maxItems": 12,
        "uniqueItems": true,
        "items": {
          "enum": [
            "observation.read",
            "acquisition.start",
            "acquisition.stop"
          ]
        }
      },
      "actuation_enabled": {
        "const": false
      }
    }
  },
  "status": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "urn:openrgd:console:peripheral-status:v0.1-candidate",
    "title": "Independent device/service/stream and control availability status",
    "description": "Design-only candidate. No host device access or operational control is installed by this schema.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "schema_version",
      "robot_id",
      "peripheral_id",
      "status_revision",
      "reported_at",
      "device",
      "publisher",
      "streams",
      "controls",
      "actuation_enabled"
    ],
    "properties": {
      "schema_version": {
        "const": "console.peripheral-status.v0.1-candidate"
      },
      "robot_id": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]{0,79}$"
      },
      "peripheral_id": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]{0,79}$"
      },
      "status_revision": {
        "type": "integer",
        "minimum": 0
      },
      "reported_at": {
        "type": "string",
        "format": "date-time"
      },
      "device": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "presence",
          "binding_verified",
          "checked_at"
        ],
        "properties": {
          "presence": {
            "enum": [
              "present",
              "absent",
              "busy",
              "unknown"
            ]
          },
          "binding_verified": {
            "type": "boolean"
          },
          "checked_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          }
        }
      },
      "publisher": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "lifecycle",
          "desired_state",
          "manager_available",
          "enabled_on_boot",
          "reported_at",
          "error_code"
        ],
        "properties": {
          "lifecycle": {
            "enum": [
              "not_installed",
              "stopped",
              "starting",
              "running",
              "stopping",
              "failed",
              "busy",
              "unknown"
            ]
          },
          "desired_state": {
            "enum": [
              "running",
              "stopped",
              "unknown"
            ]
          },
          "manager_available": {
            "type": "boolean"
          },
          "enabled_on_boot": {
            "type": [
              "boolean",
              "null"
            ]
          },
          "reported_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "error_code": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[a-z][a-z0-9_]{0,63}$"
          }
        }
      },
      "streams": {
        "type": "array",
        "maxItems": 16,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "stream_id",
            "state",
            "source_kind",
            "last_received_at",
            "age_ms"
          ],
          "properties": {
            "stream_id": {
              "type": "string",
              "pattern": "^[a-z][a-z0-9._-]{0,99}$"
            },
            "state": {
              "enum": [
                "live",
                "stale",
                "no_source",
                "invalid",
                "unknown"
              ]
            },
            "source_kind": {
              "enum": [
                "physical",
                "simulated",
                "unknown"
              ]
            },
            "last_received_at": {
              "type": [
                "string",
                "null"
              ],
              "format": "date-time"
            },
            "age_ms": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 0
            }
          }
        }
      },
      "controls": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "can_start",
          "can_stop",
          "reason"
        ],
        "properties": {
          "can_start": {
            "type": "boolean"
          },
          "can_stop": {
            "type": "boolean"
          },
          "reason": {
            "enum": [
              "ready",
              "manager_unavailable",
              "not_authorized",
              "unsupported",
              "unmanaged_owner",
              "device_missing",
              "device_busy",
              "transition_in_progress",
              "unknown"
            ]
          }
        }
      },
      "actuation_enabled": {
        "const": false
      }
    }
  },
  "host-request": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "urn:openrgd:host:peripheral-host-request:v0.1-candidate",
    "title": "Host broker local request",
    "description": "Internal same-UID Unix socket only. Not a public Console API, not an actuator interface.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "schema_version",
      "request_id",
      "robot_id",
      "peripheral_id",
      "action"
    ],
    "properties": {
      "schema_version": {
        "const": "openrgd.peripheral-host-request.v0.1-candidate"
      },
      "request_id": {
        "type": "string",
        "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
      },
      "robot_id": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]{0,79}$"
      },
      "peripheral_id": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]{0,79}$"
      },
      "action": {
        "enum": [
          "status",
          "acquisition.start",
          "acquisition.stop"
        ]
      },
      "expected_status_revision": {
        "type": "integer",
        "minimum": 0
      }
    },
    "allOf": [
      {
        "if": {
          "properties": {
            "action": {
              "enum": [
                "acquisition.start",
                "acquisition.stop"
              ]
            }
          }
        },
        "then": {
          "required": [
            "expected_status_revision"
          ]
        },
        "else": {
          "not": {
            "required": [
              "expected_status_revision"
            ]
          }
        }
      }
    ]
  },
  "host-response": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "urn:openrgd:host:peripheral-host-response:v0.1-candidate",
    "title": "Host broker local response",
    "description": "Internal same-UID Unix socket only. Not a public Console API, not an actuator interface.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "schema_version",
      "request_id",
      "robot_id",
      "peripheral_id",
      "observed_at",
      "device",
      "publisher",
      "status_revision",
      "disposition",
      "error_code",
      "actuation_enabled"
    ],
    "properties": {
      "schema_version": {
        "const": "openrgd.peripheral-host-response.v0.1-candidate"
      },
      "request_id": {
        "type": "string"
      },
      "robot_id": {
        "type": "string"
      },
      "peripheral_id": {
        "type": "string"
      },
      "observed_at": {
        "type": "string",
        "format": "date-time"
      },
      "device": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "presence",
          "binding_verified"
        ],
        "properties": {
          "presence": {
            "enum": [
              "present",
              "absent",
              "unknown"
            ]
          },
          "binding_verified": {
            "type": "boolean"
          }
        }
      },
      "publisher": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "lifecycle",
          "manager_available",
          "enabled_on_boot",
          "service_ref"
        ],
        "properties": {
          "lifecycle": {
            "enum": [
              "not_installed",
              "stopped",
              "starting",
              "running",
              "stopping",
              "failed",
              "busy",
              "unknown"
            ]
          },
          "manager_available": {
            "type": "boolean"
          },
          "enabled_on_boot": {
            "type": [
              "boolean",
              "null"
            ]
          },
          "service_ref": {
            "type": [
              "string",
              "null"
            ]
          }
        }
      },
      "status_revision": {
        "type": "integer",
        "minimum": 0
      },
      "disposition": {
        "enum": [
          "status",
          "accepted",
          "no_op",
          "rejected",
          "failed"
        ]
      },
      "error_code": {
        "type": [
          "string",
          "null"
        ],
        "pattern": "^[a-z][a-z0-9_]{0,63}$"
      },
      "actuation_enabled": {
        "const": false
      }
    }
  }
};
